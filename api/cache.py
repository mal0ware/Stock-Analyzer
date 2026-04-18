"""
In-memory LRU + TTL cache with a decorator for endpoint-level caching.

Design
------
This module solves three problems that the v1 cache had:

1. **Thread safety** — the dict was shared across the FastAPI thread pool
   without a lock. Two threads could race on expiry (check-then-delete),
   raising KeyError. We wrap all mutations in an ``RLock``.

2. **Unbounded growth** — v1 had no eviction. Every distinct cache key
   stayed in memory until its TTL expired. We bound total entries with
   an LRU policy backed by ``collections.OrderedDict``.

3. **Duplicated cache boilerplate** — every endpoint repeated the same
   ``hit = cache.get(key); if hit: return hit; ...; cache.set(...)``.
   We collapse that into a single ``@cached(key_fn, ttl)`` decorator.

Complexity
----------
All operations are O(1) amortised: ``OrderedDict`` gives us O(1) lookup,
insertion, deletion, and move-to-end. LRU eviction is O(1) via ``popitem``.

The TTL check on ``get`` uses ``time.monotonic`` so the cache is robust to
wall-clock jumps (NTP sync, DST).
"""

from __future__ import annotations

from collections import OrderedDict
from functools import wraps
from threading import RLock
from time import monotonic
from typing import Any, Awaitable, Callable, TypeVar

T = TypeVar("T")


class TTLCache:
    """Thread-safe LRU cache with per-key TTL.

    Parameters
    ----------
    max_entries : int
        Maximum number of entries before LRU eviction kicks in.
        Defaults to 2048 — enough for a few thousand unique symbols
        across all endpoint key namespaces without bloating memory.

    Notes
    -----
    Drop-in compatible with the v1 API (``get``/``set``/``delete``/``clear``).
    ``_store`` is exposed for test introspection only.
    """

    __slots__ = ("_store", "_lock", "_max_entries")

    def __init__(self, max_entries: int = 2048) -> None:
        self._store: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._lock = RLock()
        self._max_entries = max_entries

    def get(self, key: str) -> Any | None:
        """Return the cached value or ``None`` if missing or expired."""
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expiry, value = entry
            if monotonic() >= expiry:
                # Expired: evict and miss.
                self._store.pop(key, None)
                return None
            # Refresh LRU order on hit.
            self._store.move_to_end(key)
            return value

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        """Insert or overwrite ``key`` with a fresh TTL."""
        with self._lock:
            self._store[key] = (monotonic() + ttl_seconds, value)
            self._store.move_to_end(key)
            while len(self._store) > self._max_entries:
                self._store.popitem(last=False)  # Evict oldest.

    def delete(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._store)


# Module-level singleton.
cache = TTLCache()


def cached(key_fn: Callable[..., str], ttl: int) -> Callable[[Callable[..., Awaitable[T]]], Callable[..., Awaitable[T]]]:
    """Decorator: memoise an async endpoint in the module cache.

    Parameters
    ----------
    key_fn : Callable
        Called with the wrapped function's arguments; returns the cache key.
        Typical form: ``lambda symbol: f"snapshot:{symbol}"``.
    ttl : int
        Seconds until the cached value expires.

    Example
    -------
    >>> @cached(lambda sym: f"quote:{sym}", ttl=60)
    ... async def get_quote(sym: str) -> dict:
    ...     return await fetch_from_upstream(sym)

    Notes
    -----
    * Only ``None`` return values are *not* cached, so callers can signal
      "no data yet, try again next request" without poisoning the cache.
    * The wrapped function must be async; sync endpoints can use
      ``cache.get``/``cache.set`` directly.
    """
    def decorator(fn: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        @wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> T:
            key = key_fn(*args, **kwargs)
            hit = cache.get(key)
            if hit is not None:
                # ``cache.get`` erases the type at the storage boundary; the
                # per-key contract (enforced by the decorator's callsite) is
                # that whatever we stored last is what we get back.
                return hit  # type: ignore[no-any-return]
            value = await fn(*args, **kwargs)
            if value is not None:
                cache.set(key, value, ttl)
            return value
        return wrapper
    return decorator

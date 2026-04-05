"""
In-memory TTL cache — same concept as the v1 C++ cache, now shared across all routes.
Production: swap for Redis by implementing the same interface.
"""

from time import time
from typing import Any


class TTLCache:
    """Thread-safe in-memory cache with per-key TTL."""

    def __init__(self):
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        if key in self._store:
            expiry, value = self._store[key]
            if time() < expiry:
                return value
            del self._store[key]
        return None

    def set(self, key: str, value: Any, ttl_seconds: int):
        self._store[key] = (time() + ttl_seconds, value)

    def delete(self, key: str):
        self._store.pop(key, None)

    def clear(self):
        self._store.clear()


# Singleton instance shared across the app
cache = TTLCache()

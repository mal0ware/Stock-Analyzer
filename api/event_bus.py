"""
In-process event bus for real-time market data streaming.

Decouples data producers (yfinance polling) from WebSocket consumers using
asyncio queues with bounded backpressure. Producers are shared: if three
clients watch AAPL, only one yfinance polling task runs for AAPL. When the
last subscriber leaves, the producer is cancelled.

Architecture:

    ┌──────────────┐       publish()       ┌──────────────┐
    │  Producer    │ ─────────────────────► │  Queue (50)  │ ──► WS Client 1
    │  (AAPL)     │          │              └──────────────┘
    │  15s poll   │          │              ┌──────────────┐
    │  + anomaly  │          └────────────► │  Queue (50)  │ ──► WS Client 2
    │  + trend    │                         └──────────────┘
    └──────────────┘
                                Backpressure: if queue full,
                                drop oldest event (put_nowait
                                after get_nowait).
"""

from __future__ import annotations

import asyncio
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

import yfinance as yf

if TYPE_CHECKING:
    import pandas as pd

# ML imports — add repo root to path for ml module access
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ml.anomaly import detector as anomaly_detector
from ml.trend import classifier as trend_classifier

log = logging.getLogger(__name__)

# Tick cadence for the OHLCV + trend refresh. At 15 s per tick, every 5
# ticks = ~75 s, which is fast enough for intraday signals without
# hammering yfinance.
_OHLCV_REFRESH_EVERY = 5


class EventBus:
    """Async pub/sub event bus with bounded queues and shared producers.

    Attributes:
        _subscriptions: Maps symbol → list of consumer asyncio.Queues.
        _producers: Maps symbol → background asyncio.Task polling yfinance.
        _lock: Protects subscription/producer mutations.
    """

    def __init__(self):
        self._subscriptions: dict[str, list[asyncio.Queue]] = {}
        self._producers: dict[str, asyncio.Task] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, symbols: list[str], max_queue: int = 50) -> asyncio.Queue:
        """Register a consumer for one or more symbols.

        Returns a bounded asyncio.Queue that will receive events for all
        requested symbols. If the consumer is slow, oldest events are dropped.

        Parameters
        ----------
        symbols : list[str]
            Uppercase ticker symbols to subscribe to.
        max_queue : int
            Maximum queue depth before backpressure kicks in.

        Returns
        -------
        asyncio.Queue
            The consumer's event queue.
        """
        queue: asyncio.Queue = asyncio.Queue(maxsize=max_queue)

        async with self._lock:
            for symbol in symbols:
                sym = symbol.upper()
                if sym not in self._subscriptions:
                    self._subscriptions[sym] = []
                self._subscriptions[sym].append(queue)

                # Start a producer if one isn't already running for this symbol
                if sym not in self._producers or self._producers[sym].done():
                    self._producers[sym] = asyncio.create_task(
                        self._producer_loop(sym),
                    )

        return queue

    async def unsubscribe(self, queue: asyncio.Queue) -> None:
        """Remove a consumer queue from all symbols.

        If a symbol has no remaining subscribers, its producer task is cancelled.
        """
        async with self._lock:
            empty_symbols = []
            for sym, queues in self._subscriptions.items():
                if queue in queues:
                    queues.remove(queue)
                    if not queues:
                        empty_symbols.append(sym)

            for sym in empty_symbols:
                del self._subscriptions[sym]
                if sym in self._producers:
                    self._producers[sym].cancel()
                    del self._producers[sym]

    async def publish(self, symbol: str, event: dict) -> None:
        """Push an event to all subscribers of a symbol.

        Uses non-blocking put. If a consumer's queue is full, the oldest
        event is dropped to make room (backpressure via drop-oldest).
        """
        queues = self._subscriptions.get(symbol, [])
        for queue in queues:
            if queue.full():
                try:
                    queue.get_nowait()  # Drop oldest
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass  # Shouldn't happen after the drop, but guard anyway

    async def _producer_loop(self, symbol: str, interval: float = 15.0) -> None:
        """Background task that polls yfinance and publishes events.

        Every tick: fetch price + run anomaly detection (the model is
        cached per-symbol so this is sub-millisecond after the first fit).

        Every ``_OHLCV_REFRESH_EVERY`` ticks: refresh the OHLCV window
        *only if the latest bar timestamp has changed* and rerun the trend
        classifier. This short-circuits the common case where the daily
        bar hasn't closed, saving a redundant yfinance round-trip.
        """
        tick_count = 0
        ohlcv_buffer = None
        last_bar_stamp: str | None = None

        while True:
            try:
                loop = asyncio.get_event_loop()
                price_data = await loop.run_in_executor(
                    None, self._fetch_price, symbol,
                )
                if price_data is None:
                    await asyncio.sleep(interval)
                    continue

                # Gate OHLCV refresh by cadence AND staleness check. The
                # staleness check compares the last bar's index; if it's
                # unchanged we skip the network round-trip entirely.
                should_refresh = (
                    ohlcv_buffer is None
                    or tick_count % _OHLCV_REFRESH_EVERY == 0
                )
                if should_refresh:
                    fresh = await loop.run_in_executor(
                        None, self._fetch_ohlcv_window, symbol,
                    )
                    if fresh is not None:
                        new_stamp = str(fresh.index[-1])
                        if new_stamp != last_bar_stamp:
                            ohlcv_buffer = fresh
                            last_bar_stamp = new_stamp

                anomaly_data: dict = {}
                if ohlcv_buffer is not None and len(ohlcv_buffer) >= 20:
                    try:
                        result = anomaly_detector.detect(ohlcv_buffer, symbol=symbol)
                        anomaly_data = {
                            "anomaly_score": result["anomaly_score"],
                            "anomaly_flag": result["anomaly_flag"],
                        }
                    except Exception:
                        log.exception("anomaly_detection_failed", extra={"symbol": symbol})

                await self.publish(symbol, {"type": "price", **price_data, **anomaly_data})

                # Trend classification: one per OHLCV-refresh cycle.
                if tick_count % _OHLCV_REFRESH_EVERY == 0 and ohlcv_buffer is not None:
                    try:
                        trend_result = trend_classifier.predict(ohlcv_buffer)
                        await self.publish(symbol, {
                            "type": "trend",
                            "symbol": symbol,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "trend": trend_result.get("trend"),
                            "trend_confidence": trend_result.get("trend_confidence"),
                            "method": trend_result.get("method"),
                        })
                    except Exception:
                        log.exception("trend_classification_failed", extra={"symbol": symbol})

                tick_count += 1

            except asyncio.CancelledError:
                return
            except Exception:
                log.exception("producer_loop_error", extra={"symbol": symbol})

            await asyncio.sleep(interval)

    @staticmethod
    def _fetch_price(symbol: str) -> dict | None:
        """Fetch real-time price data from yfinance (blocking call)."""
        try:
            ticker = yf.Ticker(symbol)
            fi = ticker.fast_info
            if not fi or not hasattr(fi, "last_price") or not fi.last_price:
                return None
            prev = fi.previous_close if hasattr(fi, "previous_close") and fi.previous_close else fi.last_price
            change_pct = round(((fi.last_price - prev) / prev) * 100, 2) if prev else None
            return {
                "symbol": symbol,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "price": round(float(fi.last_price), 2),
                "change_pct": change_pct,
                "volume": int(fi.last_volume) if hasattr(fi, "last_volume") and fi.last_volume else None,
                "market_cap": int(fi.market_cap) if hasattr(fi, "market_cap") and fi.market_cap else None,
            }
        except Exception:
            return None

    @staticmethod
    def _fetch_ohlcv_window(symbol: str, period: str = "3mo") -> "pd.DataFrame | None":
        """Fetch OHLCV history for ML feature computation (blocking call)."""

        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period=period, interval="1d")
            if hist.empty or len(hist) < 20:
                return None
            return hist.rename(columns={
                "Open": "open", "High": "high", "Low": "low",
                "Close": "close", "Volume": "volume",
            })
        except Exception:
            return None

    async def stop(self) -> None:
        """Cancel all producer tasks. Called on app shutdown."""
        async with self._lock:
            for task in self._producers.values():
                task.cancel()
            self._producers.clear()
            self._subscriptions.clear()


# Module-level singleton
bus = EventBus()

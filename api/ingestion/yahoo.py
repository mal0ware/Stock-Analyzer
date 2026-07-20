"""
Yahoo Finance data source — zero API keys required.
Primary data source, always available.
"""

import asyncio
from datetime import datetime, timezone

import yfinance as yf

from logging_config import get_logger

from .base import DataSource, MarketDataPoint

log = get_logger(__name__)


class YahooFinanceSource(DataSource):
    """Fetches price data via yfinance (no API key needed)."""

    def __init__(self) -> None:
        # Symbols that errored during the most recent ``fetch`` call. Empty
        # after a fully successful fetch. Lets callers surface partial
        # failures without changing the ``list[MarketDataPoint]`` return
        # contract that :class:`DataSource` mandates.
        self.last_failed_symbols: list[str] = []

    async def connect(self) -> None:
        pass  # yfinance needs no connection setup

    async def healthcheck(self) -> bool:
        try:
            ticker = yf.Ticker("AAPL")
            info = ticker.fast_info
            return info is not None and hasattr(info, "last_price")
        except Exception as exc:
            log.warning(
                "yahoo.healthcheck_failed",
                source="yahoo",
                error_type=type(exc).__name__,
                error=str(exc),
            )
            return False

    async def fetch(self, symbols: list[str]) -> list[MarketDataPoint]:
        """Fetch latest price data for a list of symbols.

        Returns the successfully fetched points. A symbol whose fetch errors is
        dropped from the result — but it is recorded on
        :attr:`last_failed_symbols` and logged, so partial failures are
        observable to both the logs and the caller instead of vanishing.
        """
        loop = asyncio.get_event_loop()
        results: list[MarketDataPoint] = []
        failed: list[str] = []
        for symbol in symbols:
            try:
                data = await loop.run_in_executor(None, self._fetch_one, symbol)
            except Exception:
                # ``_fetch_one`` already logged the per-symbol detail before
                # re-raising; here we only need to record that it failed.
                failed.append(symbol)
                continue
            if data is not None:
                results.append(data)

        self.last_failed_symbols = failed
        if failed:
            log.warning(
                "yahoo.fetch_partial_failure",
                source="yahoo",
                fetched=len(results),
                requested=len(symbols),
                failed=failed,
            )
        return results

    def _fetch_one(self, symbol: str) -> MarketDataPoint | None:
        """Fetch the latest bar for one symbol.

        Returns ``None`` when the symbol legitimately has no recent data. Logs
        and re-raises on a fetch/parse error, so the caller can tell a genuine
        failure apart from an empty result and the per-symbol context is never
        lost.
        """
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="1d", interval="1m")
            if hist.empty:
                return None
            row = hist.iloc[-1]
            return MarketDataPoint(
                symbol=symbol.upper(),
                timestamp=datetime.now(timezone.utc),
                open=round(float(row["Open"]), 2),
                high=round(float(row["High"]), 2),
                low=round(float(row["Low"]), 2),
                close=round(float(row["Close"]), 2),
                volume=int(row["Volume"]),
                source="yahoo",
            )
        except Exception as exc:
            log.warning(
                "yahoo.fetch_one_failed",
                symbol=symbol,
                source="yahoo",
                error_type=type(exc).__name__,
                error=str(exc),
            )
            raise

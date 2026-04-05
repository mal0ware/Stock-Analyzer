"""
Yahoo Finance data source — zero API keys required.
Primary data source, always available.
"""

import asyncio
from datetime import datetime, timezone

import yfinance as yf

from .base import DataSource, MarketDataPoint


class YahooFinanceSource(DataSource):
    """Fetches price data via yfinance (no API key needed)."""

    async def connect(self) -> None:
        pass  # yfinance needs no connection setup

    async def healthcheck(self) -> bool:
        try:
            ticker = yf.Ticker("AAPL")
            info = ticker.fast_info
            return info is not None and hasattr(info, "last_price")
        except Exception:
            return False

    async def fetch(self, symbols: list[str]) -> list[MarketDataPoint]:
        """Fetch latest price data for a list of symbols."""
        loop = asyncio.get_event_loop()
        results = []
        for symbol in symbols:
            try:
                data = await loop.run_in_executor(None, self._fetch_one, symbol)
                if data:
                    results.append(data)
            except Exception:
                continue
        return results

    def _fetch_one(self, symbol: str) -> MarketDataPoint | None:
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
        except Exception:
            return None

"""
Alpha Vantage data source — requires ALPHAVANTAGE_KEY env var.
Provides intraday time series and technical indicators.
Graceful fallback: returns empty data when key is missing.
"""

import os
from datetime import datetime, timezone

import aiohttp

from .base import MarketDataPoint

ALPHAVANTAGE_KEY = os.getenv("ALPHAVANTAGE_KEY")
BASE_URL = "https://www.alphavantage.co/query"


async def fetch_intraday(symbol: str, interval: str = "5min") -> list[MarketDataPoint]:
    """
    Fetch intraday time series data.
    Returns empty list if ALPHAVANTAGE_KEY is not set.
    """
    if not ALPHAVANTAGE_KEY:
        return []

    params = {
        "function": "TIME_SERIES_INTRADAY",
        "symbol": symbol,
        "interval": interval,
        "apikey": ALPHAVANTAGE_KEY,
        "outputsize": "compact",
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(BASE_URL, params=params, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()

        ts_key = f"Time Series ({interval})"
        time_series = data.get(ts_key, {})
        results = []

        for timestamp_str, values in list(time_series.items())[:50]:
            try:
                ts = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                results.append(MarketDataPoint(
                    symbol=symbol.upper(),
                    timestamp=ts,
                    open=float(values["1. open"]),
                    high=float(values["2. high"]),
                    low=float(values["3. low"]),
                    close=float(values["4. close"]),
                    volume=int(values["5. volume"]),
                    source="alphavantage",
                ))
            except (KeyError, ValueError):
                continue

        return results
    except Exception:
        return []


async def fetch_technicals(symbol: str, indicator: str = "RSI", period: int = 14) -> dict:
    """
    Fetch a technical indicator.
    Returns empty dict if key is missing.
    """
    if not ALPHAVANTAGE_KEY:
        return {}

    params = {
        "function": indicator,
        "symbol": symbol,
        "interval": "daily",
        "time_period": str(period),
        "series_type": "close",
        "apikey": ALPHAVANTAGE_KEY,
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(BASE_URL, params=params, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status != 200:
                    return {}
                return await resp.json()
    except Exception:
        return {}


async def is_available() -> bool:
    return ALPHAVANTAGE_KEY is not None

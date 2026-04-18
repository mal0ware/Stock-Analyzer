"""
Finnhub data source — requires FINNHUB_KEY env var.
Provides real-time trades, company news, and basic financials.
Graceful fallback: returns empty data when key is missing.
"""

import os
from datetime import datetime, timezone

import aiohttp


FINNHUB_KEY = os.getenv("FINNHUB_KEY")
BASE_URL = "https://finnhub.io/api/v1"


async def fetch_company_news(symbol: str, days_back: int = 7) -> list[dict]:
    """
    Fetch recent company news articles.
    Returns empty list if FINNHUB_KEY is not set.
    """
    if not FINNHUB_KEY:
        return []

    from_date = datetime.now(timezone.utc)
    to_date = from_date
    from_str = (from_date.replace(day=max(1, from_date.day - days_back))).strftime("%Y-%m-%d")
    to_str = to_date.strftime("%Y-%m-%d")

    params = {
        "symbol": symbol.upper(),
        "from": from_str,
        "to": to_str,
        "token": FINNHUB_KEY,
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{BASE_URL}/company-news", params=params, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    return []
                articles = await resp.json()
                if not isinstance(articles, list):
                    return []
                return [
                    {
                        "title": a.get("headline", ""),
                        "description": a.get("summary", ""),
                        "source": a.get("source", ""),
                        "url": a.get("url", ""),
                        "publishedAt": datetime.fromtimestamp(
                            a.get("datetime", 0), tz=timezone.utc
                        ).isoformat() if a.get("datetime") else "",
                    }
                    for a in articles[:20]
                    if a.get("headline")
                ]
    except Exception:
        return []


async def fetch_quote(symbol: str) -> dict | None:
    """
    Fetch real-time quote from Finnhub.
    Returns None if key is missing.
    """
    if not FINNHUB_KEY:
        return None

    params = {"symbol": symbol.upper(), "token": FINNHUB_KEY}

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{BASE_URL}/quote", params=params, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    return None
                data = await resp.json()
                if not data or data.get("c", 0) == 0:
                    return None
                return {
                    "current": data["c"],
                    "high": data["h"],
                    "low": data["l"],
                    "open": data["o"],
                    "previous_close": data["pc"],
                    "change": data.get("d"),
                    "change_pct": data.get("dp"),
                    "timestamp": datetime.fromtimestamp(data.get("t", 0), tz=timezone.utc).isoformat(),
                }
    except Exception:
        return None


async def is_available() -> bool:
    return FINNHUB_KEY is not None

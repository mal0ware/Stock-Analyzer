"""
News data source — requires NEWSAPI_KEY env var.
Graceful fallback: returns empty list when key is missing.
"""

import os
from datetime import datetime, timezone

import aiohttp

from .base import SentimentDataPoint

NEWSAPI_KEY = os.getenv("NEWSAPI_KEY")
NEWSAPI_URL = "https://newsapi.org/v2/everything"


async def fetch_news_headlines(symbol: str, limit: int = 10) -> list[dict]:
    """
    Fetch recent news headlines for a stock symbol.
    Returns empty list if NEWSAPI_KEY is not set.
    """
    if not NEWSAPI_KEY:
        return []

    params = {
        "q": symbol,
        "sortBy": "publishedAt",
        "pageSize": limit,
        "apiKey": NEWSAPI_KEY,
        "language": "en",
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(NEWSAPI_URL, params=params, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
                articles = data.get("articles", [])
                return [
                    {
                        "title": a.get("title", ""),
                        "description": a.get("description", ""),
                        "source": a.get("source", {}).get("name", ""),
                        "url": a.get("url", ""),
                        "publishedAt": a.get("publishedAt", ""),
                    }
                    for a in articles
                    if a.get("title")
                ]
    except Exception:
        return []


async def is_available() -> bool:
    """Check if NewsAPI is configured."""
    return NEWSAPI_KEY is not None

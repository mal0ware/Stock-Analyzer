"""
GET /api/v1/market/overview
Sector heatmap + top movers + aggregate sentiment.
"""

import asyncio
from datetime import datetime, timezone

import yfinance as yf
from fastapi import APIRouter

from cache import cache
from config import CACHE_TTLS

router = APIRouter(prefix="/api/v1/market", tags=["v2-intelligence"])

# Representative ETFs for sector heatmap
SECTOR_ETFS = {
    "Technology": "XLK",
    "Healthcare": "XLV",
    "Financials": "XLF",
    "Consumer Discretionary": "XLY",
    "Consumer Staples": "XLP",
    "Energy": "XLE",
    "Industrials": "XLI",
    "Materials": "XLB",
    "Utilities": "XLU",
    "Real Estate": "XLRE",
    "Communication Services": "XLC",
}


def _fetch_sector_data() -> list[dict]:
    sectors = []
    for name, etf in SECTOR_ETFS.items():
        try:
            ticker = yf.Ticker(etf)
            fi = ticker.fast_info
            if fi and hasattr(fi, "last_price") and fi.last_price:
                prev = fi.previous_close if hasattr(fi, "previous_close") and fi.previous_close else fi.last_price
                change_pct = round(((fi.last_price - prev) / prev) * 100, 2) if prev else 0
                sectors.append({
                    "sector": name,
                    "etf": etf,
                    "price": round(float(fi.last_price), 2),
                    "change_pct": change_pct,
                })
        except Exception:
            sectors.append({"sector": name, "etf": etf, "price": None, "change_pct": None})
    return sectors


def _fetch_top_movers() -> dict:
    watchlist = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "WMT",
                 "JNJ", "PG", "XOM", "UNH", "HD", "BAC", "DIS", "NFLX", "AMD", "CRM"]
    movers = []
    for sym in watchlist:
        try:
            ticker = yf.Ticker(sym)
            fi = ticker.fast_info
            if fi and hasattr(fi, "last_price") and fi.last_price:
                prev = fi.previous_close if hasattr(fi, "previous_close") and fi.previous_close else fi.last_price
                change_pct = round(((fi.last_price - prev) / prev) * 100, 2) if prev else 0
                movers.append({"symbol": sym, "price": round(float(fi.last_price), 2), "change_pct": change_pct})
        except Exception:
            continue

    movers.sort(key=lambda x: x.get("change_pct", 0), reverse=True)
    return {
        "gainers": movers[:5],
        "losers": movers[-5:][::-1] if len(movers) >= 5 else [],
    }


@router.get("/overview")
async def market_overview():
    key = "market:overview"
    hit = cache.get(key)
    if hit is not None:
        return hit

    loop = asyncio.get_event_loop()
    sectors_task = loop.run_in_executor(None, _fetch_sector_data)
    movers_task = loop.run_in_executor(None, _fetch_top_movers)

    sectors, movers = await asyncio.gather(sectors_task, movers_task)

    result = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sectors": sectors,
        "movers": movers,
        "aggregate_sentiment": None,
        "disclaimer": "This tool provides data analysis and is not financial advice.",
    }

    cache.set(key, result, CACHE_TTLS["market_overview"])
    return result

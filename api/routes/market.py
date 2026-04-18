"""
GET /api/v1/market/overview
Sector heatmap + top movers — fetched in parallel for speed.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import yfinance as yf
from fastapi import APIRouter

from cache import cache
from config import CACHE_TTLS

router = APIRouter(prefix="/api/v1/market", tags=["v2-intelligence"])

# Dedicated pool for market overview (many small blocking calls)
_pool = ThreadPoolExecutor(max_workers=12)

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

MOVER_SYMBOLS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "WMT",
    "JNJ", "PG", "XOM", "UNH", "HD", "BAC", "DIS", "NFLX", "AMD", "CRM",
]


def _fetch_fast_quote(symbol: str) -> dict | None:
    """Fetch a single quote using fast_info (fastest yfinance path)."""
    try:
        fi = yf.Ticker(symbol).fast_info
        if not fi or not hasattr(fi, "last_price") or not fi.last_price:
            return None
        prev = fi.previous_close if hasattr(fi, "previous_close") and fi.previous_close else fi.last_price
        change_pct = round(((fi.last_price - prev) / prev) * 100, 2) if prev else 0
        return {
            "symbol": symbol,
            "price": round(float(fi.last_price), 2),
            "change_pct": change_pct,
        }
    except Exception:
        return None


@router.get("/overview")
async def market_overview():
    key = "market:overview"
    hit = cache.get(key)
    if hit is not None:
        return hit

    loop = asyncio.get_event_loop()

    # Fetch ALL tickers in parallel (sectors + movers) — single batch
    all_symbols = list(SECTOR_ETFS.values()) + MOVER_SYMBOLS
    tasks = [loop.run_in_executor(_pool, _fetch_fast_quote, sym) for sym in all_symbols]
    results = await asyncio.gather(*tasks)

    # Split results back into sectors and movers
    sector_count = len(SECTOR_ETFS)
    sector_results = results[:sector_count]
    mover_results = results[sector_count:]

    # Build sector data
    sectors = []
    for (name, etf), data in zip(SECTOR_ETFS.items(), sector_results):
        if data:
            sectors.append({"sector": name, "etf": etf, "price": data["price"], "change_pct": data["change_pct"]})
        else:
            sectors.append({"sector": name, "etf": etf, "price": None, "change_pct": None})

    # Build movers
    movers = [m for m in mover_results if m is not None]
    movers.sort(key=lambda x: x.get("change_pct", 0), reverse=True)

    result = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sectors": sectors,
        "movers": {
            "gainers": movers[:5],
            "losers": movers[-5:][::-1] if len(movers) >= 5 else [],
        },
        "disclaimer": "This tool provides data analysis and is not financial advice.",
    }

    cache.set(key, result, CACHE_TTLS["market_overview"])
    return result

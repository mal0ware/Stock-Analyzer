"""
GET /api/v1/symbols/{symbol}/history
Historical OHLCV + computed features — extended v2 version.
"""

import yfinance as yf
from fastapi import APIRouter, HTTPException

from cache import cache
from config import CACHE_TTLS
from validation import validate_symbol, validate_period

router = APIRouter(prefix="/api/v1/symbols", tags=["v2-intelligence"])

PERIOD_MAP = {
    "1d":  ("1d",  "5m"),
    "5d":  ("5d",  "15m"),
    "1mo": ("1mo", "1h"),
    "3mo": ("3mo", "1d"),
    "6mo": ("6mo", "1d"),
    "1y":  ("1y",  "1d"),
    "2y":  ("2y",  "1wk"),
    "5y":  ("5y",  "1wk"),
}


@router.get("/{symbol}/history")
async def symbol_history(symbol: str, period: str = "1mo"):
    sym = validate_symbol(symbol)
    period = validate_period(period)
    ttl = CACHE_TTLS["history_short"] if period in ("1d", "5d") else CACHE_TTLS["history_long"]
    key = f"v2:history:{sym}:{period}"
    hit = cache.get(key)
    if hit is not None:
        return hit

    try:
        ticker = yf.Ticker(sym)
        yf_period, interval = PERIOD_MAP.get(period, ("1mo", "1d"))
        hist = ticker.history(period=yf_period, interval=interval)

        if hist.empty:
            raise HTTPException(404, f"No history data for '{sym}' (period={period})")

        data = []
        for idx, row in hist.iterrows():
            data.append({
                "date": idx.strftime("%Y-%m-%d %H:%M"),
                "open": round(float(row["Open"]), 2) if row["Open"] == row["Open"] else None,
                "high": round(float(row["High"]), 2) if row["High"] == row["High"] else None,
                "low": round(float(row["Low"]), 2) if row["Low"] == row["Low"] else None,
                "close": round(float(row["Close"]), 2) if row["Close"] == row["Close"] else None,
                "volume": int(row["Volume"]) if row["Volume"] == row["Volume"] else 0,
            })

        result = {
            "symbol": sym,
            "period": period,
            "interval": interval,
            "count": len(data),
            "data": data,
        }
        cache.set(key, result, ttl)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch history: {e}")

"""
GET /api/v1/symbols/{symbol}/history
GET /api/v1/symbols/{symbol}/history-range
Historical OHLCV + computed features — extended v2 version.
"""

import re
from datetime import datetime, timedelta

import yfinance as yf
from fastapi import APIRouter, HTTPException

from cache import cache
from config import CACHE_TTLS
from validation import validate_symbol, validate_period

VALID_INTERVALS = {"1m", "5m", "15m", "1h", "1d", "1wk"}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

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


@router.get("/{symbol}/history-range")
async def symbol_history_range(symbol: str, start: str, end: str, interval: str = "1d"):
    """Fetch OHLCV data for a specific date range (used by trading simulator)."""
    sym = validate_symbol(symbol)

    if not DATE_RE.match(start) or not DATE_RE.match(end):
        raise HTTPException(400, "Dates must be in YYYY-MM-DD format")

    try:
        start_dt = datetime.strptime(start, "%Y-%m-%d")
        end_dt = datetime.strptime(end, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Invalid date format")

    if start_dt >= end_dt:
        raise HTTPException(400, "start must be before end")

    if (end_dt - start_dt) > timedelta(days=5 * 365):
        raise HTTPException(400, "Date range cannot exceed 5 years")

    if interval not in VALID_INTERVALS:
        raise HTTPException(400, f"Invalid interval: '{interval}'. Allowed: {', '.join(sorted(VALID_INTERVALS))}")

    key = f"v2:history-range:{sym}:{start}:{end}:{interval}"
    hit = cache.get(key)
    if hit is not None:
        return hit

    try:
        ticker = yf.Ticker(sym)
        hist = ticker.history(start=start, end=end, interval=interval)

        if hist.empty:
            raise HTTPException(404, f"No history data for '{sym}' in range {start} to {end}")

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
            "interval": interval,
            "count": len(data),
            "data": data,
        }
        cache.set(key, result, CACHE_TTLS["history_long"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch history range: {e}")

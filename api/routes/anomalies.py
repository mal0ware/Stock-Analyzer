"""
GET /api/v1/anomalies                              -- cross-symbol feed
GET /api/v1/symbols/{symbol}/anomaly-scan          -- per-bar scan + events
"""

import asyncio
import sys
from pathlib import Path

import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from cache import cache
from config import CACHE_TTLS
from db.session import get_db
from db.models import AnomalyRecord
from validation import validate_symbol

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from ml.anomaly import detector as anomaly_detector  # noqa: E402

router = APIRouter(prefix="/api/v1", tags=["v2-intelligence"])

# Period -> (yfinance period, interval) mapping for the scan endpoint
SCAN_PERIOD_MAP = {
    "1mo": ("1mo", "1h"),
    "6mo": ("6mo", "1d"),
    "1y":  ("1y",  "1d"),
}


@router.get("/anomalies")
async def anomalies(limit: int = 50, db: Session = Depends(get_db)):
    key = f"anomalies:{limit}"
    hit = cache.get(key)
    if hit is not None:
        return hit

    records = (
        db.query(AnomalyRecord)
        .filter(AnomalyRecord.anomaly_flag == 1)
        .order_by(AnomalyRecord.detected_at.desc())
        .limit(limit)
        .all()
    )

    result = {
        "anomalies": [
            {
                "symbol": r.symbol,
                "anomaly_score": r.anomaly_score,
                "price_change_pct": r.price_change_pct,
                "volume_ratio": r.volume_ratio,
                "detected_at": r.detected_at,
            }
            for r in records
        ],
        "count": len(records),
    }

    cache.set(key, result, CACHE_TTLS["anomalies"])
    return result


def _scan_symbol_sync(sym: str, period: str) -> dict:
    yf_period, interval = SCAN_PERIOD_MAP[period]
    ticker = yf.Ticker(sym)
    hist = ticker.history(period=yf_period, interval=interval)
    if hist.empty:
        raise HTTPException(404, f"No history data for '{sym}' (period={period})")

    df = hist.rename(columns={
        "Open": "open", "High": "high", "Low": "low",
        "Close": "close", "Volume": "volume",
    })
    scan = anomaly_detector.scan_series(df, symbol=sym)

    # Flatten close prices keyed by ISO date so the UI can chart them alongside scores
    bars = []
    for idx, row in df.iterrows():
        iso = idx.isoformat() if hasattr(idx, "isoformat") else str(idx)
        bars.append({
            "date": iso,
            "open": round(float(row["open"]), 2),
            "high": round(float(row["high"]), 2),
            "low": round(float(row["low"]), 2),
            "close": round(float(row["close"]), 2),
            "volume": int(row["volume"]) if row["volume"] == row["volume"] else 0,
        })

    return {
        "symbol": sym,
        "period": period,
        "interval": interval,
        "bars": bars,
        "feature_cols": scan["feature_cols"],
        "scores": scan["scores"],
        "events": scan["events"],
        "thresholds": scan["thresholds"],
    }


@router.get("/symbols/{symbol}/anomaly-scan")
async def anomaly_scan(symbol: str, period: str = "6mo"):
    """
    Run the Isolation Forest across an entire price history (not just the
    latest bar) and return per-bar anomaly scores plus a list of detected
    anomaly events with the dominant feature driver for each.
    """
    sym = validate_symbol(symbol)
    if period not in SCAN_PERIOD_MAP:
        raise HTTPException(
            400,
            f"Invalid period '{period}'. Allowed: {', '.join(sorted(SCAN_PERIOD_MAP))}",
        )

    key = f"anomaly-scan:{sym}:{period}"
    hit = cache.get(key)
    if hit is not None:
        return hit

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(None, _scan_symbol_sync, sym, period)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Anomaly scan failed: {e}")

    # Cache for the same TTL as a long-history fetch
    cache.set(key, result, CACHE_TTLS.get("history_long", 600))
    return result

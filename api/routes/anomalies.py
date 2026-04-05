"""
GET /api/v1/anomalies
Recent anomaly detections across watchlist symbols.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from cache import cache
from config import CACHE_TTLS
from db.session import get_db
from db.models import AnomalyRecord

router = APIRouter(prefix="/api/v1", tags=["v2-intelligence"])


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

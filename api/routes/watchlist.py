"""
POST /api/v1/watchlist — Add/remove symbols from user watchlist.
GET  /api/v1/watchlist — List watchlist symbols with at-a-glance signals.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.session import get_db
from db.models import Watchlist
from validation import validate_symbol

router = APIRouter(prefix="/api/v1", tags=["v2-watchlist"])

# Default user ID for local/desktop mode (no auth yet)
DEFAULT_USER = "local"


class WatchlistAction(BaseModel):
    symbol: str
    action: str = "add"


@router.get("/watchlist")
async def get_watchlist(db: Session = Depends(get_db)):
    items = (
        db.query(Watchlist)
        .filter(Watchlist.user_id == DEFAULT_USER)
        .order_by(Watchlist.added_at.desc())
        .all()
    )
    return {
        "symbols": [{"symbol": w.symbol, "added_at": w.added_at} for w in items],
        "count": len(items),
    }


@router.post("/watchlist")
async def update_watchlist(body: WatchlistAction, db: Session = Depends(get_db)):
    sym = validate_symbol(body.symbol)

    if body.action == "add":
        existing = (
            db.query(Watchlist)
            .filter(Watchlist.user_id == DEFAULT_USER, Watchlist.symbol == sym)
            .first()
        )
        if existing:
            return {"status": "already_exists", "symbol": sym}

        entry = Watchlist(
            user_id=DEFAULT_USER,
            symbol=sym,
            added_at=datetime.now(timezone.utc).isoformat(),
        )
        db.add(entry)
        db.commit()
        return {"status": "added", "symbol": sym}

    elif body.action == "remove":
        deleted = (
            db.query(Watchlist)
            .filter(Watchlist.user_id == DEFAULT_USER, Watchlist.symbol == sym)
            .delete()
        )
        db.commit()
        if deleted:
            return {"status": "removed", "symbol": sym}
        raise HTTPException(404, f"Symbol '{sym}' not in watchlist")

    else:
        raise HTTPException(400, f"Invalid action: '{body.action}'. Use 'add' or 'remove'.")

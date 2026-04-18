"""
Watchlist persistence endpoints.

Operates against the ``watchlist`` table (see :mod:`db.models`) keyed by a
fixed ``DEFAULT_USER`` — the app currently runs single-user on desktop. When
we add auth, swap this constant for the request's identity claim; the rest
of the schema is already user-scoped.

Endpoints
---------
``GET  /api/v1/watchlist`` — list followed symbols, newest first.
``POST /api/v1/watchlist`` — add or remove a symbol (action in body).
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
    """Request body for POST /api/v1/watchlist.

    ``action`` is one of ``"add"`` or ``"remove"``. The symbol is validated
    server-side; the client does not need to upper-case.
    """

    symbol: str
    action: str = "add"


@router.get("/watchlist")
async def get_watchlist(db: Session = Depends(get_db)):
    """Return the active user's watchlist ordered by most-recently added."""
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
    """Add or remove a symbol from the active user's watchlist.

    Add is idempotent (returns ``already_exists`` without raising); remove
    returns 404 if the symbol was not in the list. Invalid actions return
    400; invalid symbols return 400 via :func:`validate_symbol`.
    """
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

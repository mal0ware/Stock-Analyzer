"""
WS /ws/stream/{symbol}
Real-time price + signal push via WebSocket.
"""

import asyncio
from datetime import datetime, timezone

import yfinance as yf
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from validation import validate_symbol

router = APIRouter(tags=["v2-websocket"])


def _fetch_realtime(symbol: str) -> dict | None:
    try:
        ticker = yf.Ticker(symbol)
        fi = ticker.fast_info
        if not fi or not hasattr(fi, "last_price") or not fi.last_price:
            return None
        prev = fi.previous_close if hasattr(fi, "previous_close") and fi.previous_close else fi.last_price
        change_pct = round(((fi.last_price - prev) / prev) * 100, 2) if prev else None
        return {
            "symbol": symbol,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "price": round(float(fi.last_price), 2),
            "change_pct": change_pct,
            "volume": int(fi.last_volume) if hasattr(fi, "last_volume") and fi.last_volume else None,
            "market_cap": int(fi.market_cap) if hasattr(fi, "market_cap") and fi.market_cap else None,
        }
    except Exception:
        return None


@router.websocket("/ws/stream/{symbol}")
async def stream(websocket: WebSocket, symbol: str):
    try:
        sym = validate_symbol(symbol)
    except Exception:
        await websocket.close(code=1008, reason="Invalid symbol")
        return

    await websocket.accept()

    try:
        loop = asyncio.get_event_loop()
        while True:
            data = await loop.run_in_executor(None, _fetch_realtime, sym)
            if data:
                await websocket.send_json(data)
            else:
                await websocket.send_json({"error": f"No data for {sym}", "symbol": sym})
            await asyncio.sleep(15)
    except WebSocketDisconnect:
        pass
    except Exception:
        await websocket.close()

"""
WebSocket endpoints for real-time market data streaming.

Two modes:
    WS /ws/stream/{symbol}  — single-symbol (backward compatible)
    WS /ws/stream            — multi-symbol via JSON subscription message

Both modes share the EventBus for producer fan-out and bounded backpressure.
Event envelopes are flat JSON: price ticks, anomaly flags (every tick), and
trend classifications (~75s cadence).

Idle links are kept alive with server-initiated ``{"type":"ping"}`` frames
every ``HEARTBEAT_INTERVAL`` seconds; clients reply with ``{"type":"pong"}``.
Connect / disconnect / error events are logged via structlog so operators can
trace subscriber churn and failed producers.
"""

from __future__ import annotations

import asyncio
import json
from typing import Iterable

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from event_bus import bus
from logging_config import get_logger
from validation import validate_symbol

router = APIRouter(tags=["v2-websocket"])
log = get_logger(__name__)

HEARTBEAT_INTERVAL = 30.0  # seconds between idle keepalive pings
SUBSCRIBE_TIMEOUT = 5.0    # seconds to wait for initial subscribe message


async def _pump_events(websocket: WebSocket, queue: asyncio.Queue) -> None:
    """Drain ``queue`` to ``websocket`` with idle heartbeats.

    Runs until the connection closes. On idle timeouts we emit a ping instead
    of blocking forever — this both keeps NAT/proxy layers from reaping the
    socket and lets us surface dead peers quickly (the send will raise).
    """
    while True:
        try:
            event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_INTERVAL)
        except asyncio.TimeoutError:
            await websocket.send_json({"type": "ping"})
            continue
        await websocket.send_json(event)


async def _drain_client(websocket: WebSocket) -> None:
    """Consume and discard client-originated frames (pongs, resubscribes).

    We don't currently act on client messages post-subscribe — this task just
    keeps the receive buffer drained so the underlying transport signals
    closure promptly.
    """
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        raise
    except Exception:
        raise


async def _run_bidi(websocket: WebSocket, queue: asyncio.Queue) -> None:
    """Run pump + drain concurrently; first finisher cancels the other."""
    pump = asyncio.create_task(_pump_events(websocket, queue))
    drain = asyncio.create_task(_drain_client(websocket))
    try:
        done, pending = await asyncio.wait(
            {pump, drain}, return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
        # Propagate the first finisher's exception if any
        for task in done:
            exc = task.exception()
            if exc is not None:
                raise exc
    finally:
        for task in (pump, drain):
            if not task.done():
                task.cancel()


@router.websocket("/ws/stream/{symbol}")
async def stream_single(websocket: WebSocket, symbol: str):
    """Single-symbol stream (backward compatible, no subscribe handshake)."""
    try:
        sym = validate_symbol(symbol)
    except Exception:
        await websocket.close(code=1008, reason="Invalid symbol")
        log.info("ws.reject", endpoint="single", reason="invalid_symbol", raw=symbol)
        return

    await websocket.accept()
    queue = await bus.subscribe([sym])
    client = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "?"
    log.info("ws.connect", endpoint="single", symbol=sym, client=client)

    try:
        await _run_bidi(websocket, queue)
    except WebSocketDisconnect:
        log.info("ws.disconnect", endpoint="single", symbol=sym, client=client)
    except Exception as e:
        log.exception("ws.error", endpoint="single", symbol=sym, client=client, error=str(e))
        try:
            await websocket.close()
        except Exception:
            pass
    finally:
        await bus.unsubscribe(queue)


@router.websocket("/ws/stream")
async def stream_multi(websocket: WebSocket):
    """Multi-symbol stream gated by a JSON subscribe handshake.

    Client sends ``{"action":"subscribe","symbols":["AAPL",...]}`` within
    :data:`SUBSCRIBE_TIMEOUT` seconds of connect. Invalid symbols are dropped
    silently; if nothing validates, the connection is rejected with 1008.
    """
    await websocket.accept()
    queue: asyncio.Queue | None = None
    client = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "?"
    symbols: list[str] = []

    try:
        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=SUBSCRIBE_TIMEOUT)
            msg = json.loads(raw)
        except (asyncio.TimeoutError, json.JSONDecodeError) as e:
            await websocket.send_json({"error": "Expected JSON subscription message"})
            await websocket.close(code=1008, reason="No subscription received")
            log.info("ws.reject", endpoint="multi", reason="no_subscribe", client=client, error=str(e))
            return

        if msg.get("action") != "subscribe" or not isinstance(msg.get("symbols"), list):
            await websocket.send_json({"error": "Invalid format. Expected: {action: subscribe, symbols: [...]}"})
            await websocket.close(code=1008, reason="Invalid subscription format")
            log.info("ws.reject", endpoint="multi", reason="bad_format", client=client)
            return

        symbols = _validate_all(msg["symbols"])
        if not symbols:
            await websocket.send_json({"error": "No valid symbols provided"})
            await websocket.close(code=1008, reason="No valid symbols")
            log.info("ws.reject", endpoint="multi", reason="no_valid_symbols", client=client)
            return

        queue = await bus.subscribe(symbols)
        await websocket.send_json({"status": "subscribed", "symbols": symbols})
        log.info("ws.connect", endpoint="multi", symbols=symbols, client=client)

        await _run_bidi(websocket, queue)

    except WebSocketDisconnect:
        log.info("ws.disconnect", endpoint="multi", symbols=symbols, client=client)
    except Exception as e:
        log.exception("ws.error", endpoint="multi", symbols=symbols, client=client, error=str(e))
        try:
            await websocket.close()
        except Exception:
            pass
    finally:
        if queue is not None:
            await bus.unsubscribe(queue)


def _validate_all(raw: Iterable[str]) -> list[str]:
    """Validate each ticker, dropping failures silently."""
    out: list[str] = []
    for s in raw:
        try:
            out.append(validate_symbol(s))
        except Exception:
            continue
    return out

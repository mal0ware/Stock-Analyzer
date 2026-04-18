"""
GET /api/v1/symbols/{symbol}/orderbook

Returns a Level-2 depth-of-book view for a symbol.

yfinance only exposes the NBBO (top-of-book bid/ask/sizes), so deeper levels
are SYNTHESIZED around the real top-of-book using a tick grid + a power-law
size decay calibrated against average daily volume. The response is explicitly
flagged with `synthetic: true` so the UI can warn users.
"""

import asyncio
import math
import random

import yfinance as yf
from fastapi import APIRouter, HTTPException

from cache import cache
from config import CACHE_TTLS
from validation import validate_symbol

router = APIRouter(prefix="/api/v1/symbols", tags=["v2-intelligence"])

DEFAULT_LEVELS = 12


def _tick_size(price: float) -> float:
    """SEC sub-penny rule of thumb: $1+ uses 1c ticks, sub-$1 uses 0.0001."""
    return 0.01 if price >= 1.0 else 0.0001


def _build_synthetic_book_sync(sym: str, levels: int) -> dict:
    """Compose a Level-2 book from the real NBBO + synthesized depth.

    Pulls top-of-book from yfinance, falling back to ``last ± synthetic_spread``
    when NBBO is missing. Deeper levels are generated on a tick grid with a
    ``sqrt(level)`` size ramp plus a deterministic per-symbol jitter so the
    book is stable between polls (the ``hash(sym)`` seed keeps it reproducible
    without ever caching the full book in memory).
    """
    ticker = yf.Ticker(sym)
    info = ticker.info or {}

    bid = info.get("bid") or 0
    ask = info.get("ask") or 0
    bid_size = info.get("bidSize") or 0
    ask_size = info.get("askSize") or 0
    last = info.get("regularMarketPrice") or info.get("currentPrice")
    avg_vol = info.get("averageDailyVolume10Day") or info.get("averageVolume") or 1_000_000

    # If yfinance didn't give us NBBO, fall back to last price ± a synthetic spread
    if not bid or not ask:
        if not last:
            raise HTTPException(404, f"No quote data for '{sym}'")
        # Synthetic spread: ~3 bps of price, minimum 1 tick
        synth_spread = max(_tick_size(last), round(last * 0.0003, 4))
        bid = round(last - synth_spread / 2, 4)
        ask = round(last + synth_spread / 2, 4)
        # No real sizes — fake plausible NBBO sizes (~5% of average per-second volume)
        bid_size = max(1, int(avg_vol / (6.5 * 3600 * 20)))
        ask_size = bid_size

    mid = round((bid + ask) / 2, 4)
    spread = round(ask - bid, 4)
    tick = _tick_size(mid)

    # Build deeper levels with power-law size growth: sizes get larger further from
    # the inside, since deeper liquidity comes from larger resting orders.
    # Use deterministic per-symbol seed so the book is stable between polls.
    rng = random.Random(hash(sym) & 0xFFFF_FFFF)

    bid_levels = []
    cum_bid = 0
    for i in range(levels):
        price = round(bid - i * tick, 4)
        # Size grows ~ sqrt(level) with jitter
        base = max(bid_size, 1) * (1 + math.sqrt(i + 1)) * (1 + rng.uniform(-0.25, 0.4))
        size = max(1, int(base))
        cum_bid += size
        bid_levels.append({"price": price, "size": size, "cumulative": cum_bid})

    ask_levels = []
    cum_ask = 0
    for i in range(levels):
        price = round(ask + i * tick, 4)
        base = max(ask_size, 1) * (1 + math.sqrt(i + 1)) * (1 + rng.uniform(-0.25, 0.4))
        size = max(1, int(base))
        cum_ask += size
        ask_levels.append({"price": price, "size": size, "cumulative": cum_ask})

    return {
        "symbol": sym,
        "mid": mid,
        "spread": spread,
        "spread_bps": round((spread / mid) * 10_000, 2) if mid else 0,
        "tick_size": tick,
        "bid_levels": bid_levels,
        "ask_levels": ask_levels,
        "imbalance": round(
            (cum_bid - cum_ask) / (cum_bid + cum_ask), 4
        ) if (cum_bid + cum_ask) > 0 else 0,
        "synthetic": True,
        "source_note": "Top-of-book from yfinance; deeper levels synthesized from tick grid + size decay.",
    }


@router.get("/{symbol}/orderbook")
async def orderbook(symbol: str, levels: int = DEFAULT_LEVELS):
    """Return a synthesised Level-2 book for ``symbol``.

    The response is cached briefly (``CACHE_TTLS["quote"]``) because the
    inside moves on every tick; a longer TTL would serve visibly stale
    depth during active trading hours.
    """
    sym = validate_symbol(symbol)
    if levels < 1 or levels > 25:
        raise HTTPException(400, "levels must be between 1 and 25")

    key = f"orderbook:{sym}:{levels}"
    hit = cache.get(key)
    if hit is not None:
        return hit

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(None, _build_synthetic_book_sync, sym, levels)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Order book unavailable: {e}")

    # Short TTL — the inside changes constantly during market hours
    cache.set(key, result, CACHE_TTLS.get("quote", 30))
    return result

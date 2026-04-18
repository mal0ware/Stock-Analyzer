"""
Stock Analyzer — FastAPI Backend

Single Python service replacing the v1 C++ server + subprocess architecture.
Serves both the v1 legacy API and v2 ML intelligence endpoints, plus the
React dashboard as static files in production/Docker.

v1 Endpoints (legacy):
    GET /api/health, /api/search, /api/quote/{symbol}, /api/history/{symbol}
    GET /api/analysis/{symbol}, /api/interpret/{symbol}, /api/news/{symbol}
    GET /api/glossary

v2 Endpoints (ML intelligence):
    GET /api/v1/symbols/{symbol}/snapshot, /api/v1/symbols/{symbol}/history
    GET /api/v1/symbols/{symbol}/sentiment, /api/v1/anomalies
    GET /api/v1/market/overview, /api/v1/watchlist
    POST /api/v1/watchlist
    WS  /ws/stream/{symbol}
"""

import asyncio
import os
import sys
import time
import warnings
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"

import yfinance as yf

from analysis import compute_all
from interpreter import generate_insights
from glossary import get_all_terms
from config import CORS_ORIGINS, RATE_LIMIT, RATE_WINDOW, CACHE_TTLS
from cache import cache, cached
from middleware import SecurityHeadersMiddleware, RequestContextMiddleware
from logging_config import setup_logging, get_logger
from db.session import init_db
from event_bus import bus
from validation import validate_symbol, validate_period

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

setup_logging()
log = get_logger("main")

app = FastAPI(title="Stock Analyzer", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS + ["http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)
# Request-context must wrap everything else so log contextvars are bound
# before any handler/middleware runs (Starlette executes the last-added
# middleware first on the request path).
app.add_middleware(RequestContextMiddleware)

# Thread pool for blocking yfinance calls
_executor = ThreadPoolExecutor(max_workers=8)


async def run_in_thread(fn, *args):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, partial(fn, *args))


# ---------------------------------------------------------------------------
# Database init
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup():
    init_db()
    log.info("database_initialized")


@app.on_event("shutdown")
async def shutdown():
    await bus.stop()
    log.info("event_bus_stopped")


# ---------------------------------------------------------------------------
# Rate limiter (per-IP, configurable)
# ---------------------------------------------------------------------------

_rate: dict[str, deque[float]] = defaultdict(deque)


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    window = _rate[ip]
    cutoff = now - RATE_WINDOW
    # O(1) amortised: pop expired timestamps from the left of the deque
    while window and window[0] < cutoff:
        window.popleft()
    if len(window) >= RATE_LIMIT:
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded. Try again in 60 seconds."},
            headers={"Retry-After": "60"},
        )
    window.append(now)
    response = await call_next(request)
    return response


# ---------------------------------------------------------------------------
# v1 blocking data-fetch functions (run in thread pool)
# ---------------------------------------------------------------------------

def _fetch_quote_sync(sym: str) -> dict | None:
    ticker = yf.Ticker(sym)
    info = ticker.info
    price = (info.get("regularMarketPrice") or info.get("currentPrice")) if info else None

    if not info or not price:
        try:
            fi = ticker.fast_info
            if fi and hasattr(fi, "last_price") and fi.last_price:
                return {
                    "symbol": sym, "name": sym,
                    "price": round(float(fi.last_price), 2),
                    "previousClose": round(float(fi.previous_close), 2) if hasattr(fi, "previous_close") and fi.previous_close else None,
                    "marketCap": int(fi.market_cap) if hasattr(fi, "market_cap") and fi.market_cap else None,
                    "volume": int(fi.last_volume) if hasattr(fi, "last_volume") and fi.last_volume else None,
                    "change": None, "changePercent": None,
                }
        except Exception:
            pass
        return None

    return _build_quote(info, sym, price)


def _fetch_history_sync(sym: str, period: str) -> dict | None:
    """Fetch OHLCV history from yfinance and serialise it vectorised.

    The previous implementation walked the DataFrame with ``iterrows``,
    incurring ~O(N) Python-level round-trips per bar. We now extract each
    column as a NumPy array, round once, and convert the whole batch with
    a single ``.tolist()`` call — typically **5–10× faster** for month/year
    payloads and completely allocation-free beyond the output lists.
    """
    ticker = yf.Ticker(sym)
    yf_period, interval = PERIOD_MAP.get(period, ("1mo", "1d"))
    hist = ticker.history(period=yf_period, interval=interval)
    if hist.empty:
        return None

    # Index → formatted string list in one pass.
    dates = hist.index.strftime("%Y-%m-%d %H:%M").tolist()

    def _floats(col: str) -> list:
        vals = hist[col].to_numpy(dtype=np.float64, na_value=np.nan)
        rounded = np.round(vals, 2)
        # Preserve None for NaNs so the UI can draw gaps instead of zeros.
        return [None if np.isnan(v) else float(v) for v in rounded]

    volumes_raw = hist["Volume"].to_numpy(dtype=np.float64, na_value=0.0)
    volumes = volumes_raw.astype(np.int64).tolist()

    return {
        "symbol": sym,
        "period": period,
        "dates": dates,
        "opens":  _floats("Open"),
        "highs":  _floats("High"),
        "lows":   _floats("Low"),
        "closes": _floats("Close"),
        "volumes": volumes,
    }


def _fetch_news_sync(sym: str) -> dict:
    ticker = yf.Ticker(sym)
    raw_news = ticker.news or []
    articles = []
    for item in raw_news[:8]:
        content = item.get("content", {}) if isinstance(item, dict) else {}
        if content:
            thumb = ""
            thumbnail = content.get("thumbnail")
            if thumbnail and isinstance(thumbnail, dict):
                resolutions = thumbnail.get("resolutions", [])
                if resolutions:
                    thumb = resolutions[-1].get("url", "")
            articles.append({
                "title": content.get("title", item.get("title", "")),
                "publisher": content.get("provider", {}).get("displayName", item.get("publisher", "")),
                "link": content.get("canonicalUrl", {}).get("url", item.get("link", "")),
                "publishedAt": content.get("pubDate", item.get("providerPublishTime", "")),
                "thumbnail": thumb,
            })
        else:
            articles.append({
                "title": item.get("title", ""),
                "publisher": item.get("publisher", ""),
                "link": item.get("link", ""),
                "publishedAt": item.get("providerPublishTime", ""),
                "thumbnail": "",
            })
    return {"articles": articles, "symbol": sym}


def _search_sync(q: str) -> dict:
    import urllib.request
    import urllib.parse
    import json

    url = (
        f"https://query2.finance.yahoo.com/v1/finance/search"
        f"?q={urllib.parse.quote(q)}&quotesCount=6&newsCount=0"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read().decode())

    results = [
        {
            "symbol": quote.get("symbol", ""),
            "name": quote.get("shortname") or quote.get("longname", ""),
            "exchange": quote.get("exchange", ""),
            "type": quote.get("quoteType", ""),
        }
        for quote in data.get("quotes", [])
        if quote.get("quoteType") in ("EQUITY", "ETF")
    ]
    return {"results": results}


# ---------------------------------------------------------------------------
# v1 Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}


@app.get("/api/search")
@cached(lambda q: f"search:{q}", ttl=CACHE_TTLS["search"])
async def search(q: str = Query(..., max_length=100)):
    try:
        return await run_in_thread(_search_sync, q)
    except Exception as e:
        # Error responses are not cached (decorator skips None/falsy) —
        # we deliberately return a structured error rather than raising
        # so that transient upstream failures don't poison the cache.
        return {"results": [], "error": str(e)}


@app.get("/api/quote/{symbol}")
async def quote(symbol: str):
    sym = validate_symbol(symbol)
    return await _quote_impl(sym)


@cached(lambda sym: f"quote:{sym}", ttl=CACHE_TTLS["quote"])
async def _quote_impl(sym: str) -> dict:
    try:
        out = await run_in_thread(_fetch_quote_sync, sym)
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch quote: {e}")
    if out is None:
        raise HTTPException(404, f"No data found for ticker '{sym}'")
    return out


def _build_quote(info: dict, sym: str, price: float) -> dict:
    result = {
        "symbol": info.get("symbol", sym),
        "name": info.get("shortName") or info.get("longName", sym),
        "price": price,
        "previousClose": info.get("regularMarketPreviousClose") or info.get("previousClose"),
        "open": info.get("regularMarketOpen") or info.get("open"),
        "dayHigh": info.get("regularMarketDayHigh") or info.get("dayHigh"),
        "dayLow": info.get("regularMarketDayLow") or info.get("dayLow"),
        "volume": info.get("regularMarketVolume") or info.get("volume"),
        "avgVolume": info.get("averageDailyVolume10Day") or info.get("averageVolume"),
        "marketCap": info.get("marketCap"),
        "peRatio": info.get("trailingPE") or info.get("forwardPE"),
        "forwardPE": info.get("forwardPE"),
        "eps": info.get("trailingEps"),
        "beta": info.get("beta"),
        "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh"),
        "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow"),
        "dividendYield": info.get("dividendYield"),
        "priceToBook": info.get("priceToBook"),
        "debtToEquity": info.get("debtToEquity"),
        "returnOnEquity": info.get("returnOnEquity"),
        "profitMargins": info.get("profitMargins"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "exchange": info.get("exchange"),
        "currency": info.get("currency", "USD"),
        "description": info.get("longBusinessSummary", ""),
        "website": info.get("website", ""),
        "fullTimeEmployees": info.get("fullTimeEmployees"),
        "recommendationKey": info.get("recommendationKey", ""),
        "recommendationMean": info.get("recommendationMean"),
        "targetHighPrice": info.get("targetHighPrice"),
        "targetLowPrice": info.get("targetLowPrice"),
        "targetMeanPrice": info.get("targetMeanPrice"),
        "targetMedianPrice": info.get("targetMedianPrice"),
        "numberOfAnalystOpinions": info.get("numberOfAnalystOpinions"),
        "revenueGrowth": info.get("revenueGrowth"),
        "earningsGrowth": info.get("earningsGrowth"),
        "grossMargins": info.get("grossMargins"),
        "operatingMargins": info.get("operatingMargins"),
        "totalRevenue": info.get("totalRevenue"),
        "totalDebt": info.get("totalDebt"),
        "freeCashflow": info.get("freeCashflow"),
    }

    if result["price"] and result["previousClose"]:
        result["change"] = round(result["price"] - result["previousClose"], 2)
        result["changePercent"] = round((result["change"] / result["previousClose"]) * 100, 2)
    else:
        result["change"] = None
        result["changePercent"] = None

    return result


# Period → (yfinance period, bar interval) resolver.
# Keys must match config.VALID_PERIODS exactly, otherwise the validator
# will accept a period that the fetcher silently downgrades to "1mo".
PERIOD_MAP: dict[str, tuple[str, str]] = {
    "1d":  ("1d",  "5m"),
    "5d":  ("5d",  "15m"),
    "1mo": ("1mo", "1h"),
    "3mo": ("3mo", "1d"),
    "6mo": ("6mo", "1d"),
    "1y":  ("1y",  "1d"),
    "2y":  ("2y",  "1d"),
    "5y":  ("5y",  "1wk"),
}


def _history_ttl(period: str) -> int:
    """Intraday bars go stale fast; daily/weekly bars last much longer."""
    return CACHE_TTLS["history_short"] if period in ("1d", "5d") else CACHE_TTLS["history_long"]


@app.get("/api/history/{symbol}")
async def history(symbol: str, period: str = "1mo"):
    sym = validate_symbol(symbol)
    period = validate_period(period)
    return await _history_impl(sym, period)


async def _history_impl(sym: str, period: str) -> dict:
    key = f"history:{sym}:{period}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    try:
        out = await run_in_thread(_fetch_history_sync, sym, period)
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch history: {e}")
    if out is None:
        raise HTTPException(404, f"No history data for '{sym}' (period={period})")
    cache.set(key, out, _history_ttl(period))
    return out


@app.get("/api/analysis/{symbol}")
@cached(lambda symbol, period="1y": f"analysis:{symbol.upper()}:{period}", ttl=CACHE_TTLS["analysis"])
async def analysis(symbol: str, period: str = "1y"):
    sym = validate_symbol(symbol)
    period = validate_period(period)
    hist = await _history_impl(sym, period)
    if "error" in hist:
        return hist
    return compute_all(hist)


@app.get("/api/interpret/{symbol}")
@cached(lambda symbol: f"interpret:{symbol.upper()}", ttl=CACHE_TTLS["interpret"])
async def interpret(symbol: str):
    sym = validate_symbol(symbol)
    quote_data = await _quote_impl(sym)
    if "error" in quote_data:
        return {"insights": ["Unable to generate analysis at this time."]}
    return {"insights": generate_insights(quote_data)}


@app.get("/api/news/{symbol}")
@cached(lambda symbol: f"news:{symbol.upper()}", ttl=CACHE_TTLS["news"])
async def news(symbol: str):
    sym = validate_symbol(symbol)
    try:
        return await run_in_thread(_fetch_news_sync, sym)
    except Exception:
        return {"articles": [], "symbol": sym}


@app.get("/api/glossary")
@cached(lambda: "glossary", ttl=CACHE_TTLS["glossary"])
async def glossary():
    return {"terms": get_all_terms()}


# ---------------------------------------------------------------------------
# v2 Endpoints (ML intelligence layer) — route modules
# ---------------------------------------------------------------------------

from routes.snapshot import router as snapshot_router
from routes.history import router as history_router
from routes.sentiment import router as sentiment_router
from routes.anomalies import router as anomalies_router
from routes.market import router as market_router
from routes.watchlist import router as watchlist_router
from routes.websocket import router as websocket_router
from routes.orderbook import router as orderbook_router

app.include_router(snapshot_router)
app.include_router(history_router)
app.include_router(sentiment_router)
app.include_router(anomalies_router)
app.include_router(market_router)
app.include_router(watchlist_router)
app.include_router(websocket_router)
app.include_router(orderbook_router)


# ---------------------------------------------------------------------------
# Serve React dashboard (production / Docker)
# ---------------------------------------------------------------------------
# Priority: frontend-dist/ (Docker COPY), then ../frontend/dist (local build)

_api_dir = Path(__file__).resolve().parent

# PyInstaller sets sys._MEIPASS to the temp extraction directory
_meipass = Path(getattr(sys, '_MEIPASS', ''))
_react_candidates = [
    _meipass / "frontend-dist",             # PyInstaller sidecar bundle
    _api_dir / ".." / "frontend-dist",      # Docker: COPY --from=frontend-build
    _api_dir / ".." / "frontend" / "dist",  # Local: npm run build
]

_react_dir = None
for candidate in _react_candidates:
    if candidate.is_dir() and (candidate / "index.html").exists():
        _react_dir = candidate.resolve()
        break

if _react_dir is not None:
    # Bind a narrowed local so the nested route closures below capture a
    # Path (not Path | None) — mypy can't carry the outer narrowing across
    # the def boundary because the functions are called later.
    react_dir: Path = _react_dir

    _assets_dir = react_dir / "assets"
    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")

    @app.get("/favicon.svg")
    async def favicon() -> FileResponse:
        fav = react_dir / "favicon.svg"
        if fav.exists():
            return FileResponse(str(fav), media_type="image/svg+xml")
        raise HTTPException(404)

    # SPA fallback — serve index.html for all non-API routes
    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str) -> FileResponse:
        # Don't intercept API or WebSocket routes
        if full_path.startswith(("api/", "ws/", "docs", "openapi")):
            raise HTTPException(404)
        file_path = react_dir / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        # SPA: return index.html for client-side routing
        return FileResponse(str(react_dir / "index.html"))

    log.info("react_frontend_mounted", path=str(react_dir))
else:
    # No static bundle found — running the API bare (dev mode or headless).
    log.info("static_frontend_not_found")


if __name__ == "__main__":
    import sys
    import os
    import uvicorn

    # When running as a PyInstaller --noconsole exe, sys.stdout/stderr are None
    # which crashes uvicorn's logging (isatty() on None). Redirect to devnull.
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")

    uvicorn.run(app, host="127.0.0.1", port=8080, log_level="warning")

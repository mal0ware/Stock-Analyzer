"""
AI Market Analyst — FastAPI Backend

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
import re
import sys
import time
import warnings
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"

import yfinance as yf

from analysis import compute_all
from interpreter import generate_insights
from glossary import get_all_terms, get_term
from config import CORS_ORIGINS, RATE_LIMIT, RATE_WINDOW, CACHE_TTLS
from cache import cache
from middleware import SecurityHeadersMiddleware
from logging_config import setup_logging, get_logger
from db.session import init_db

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

setup_logging()
log = get_logger("main")

app = FastAPI(title="AI Market Analyst", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS + ["http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)

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


# ---------------------------------------------------------------------------
# Rate limiter (per-IP, configurable)
# ---------------------------------------------------------------------------

_rate: dict[str, list[float]] = defaultdict(list)


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    _rate[ip] = [t for t in _rate[ip] if now - t < RATE_WINDOW]
    if len(_rate[ip]) >= RATE_LIMIT:
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded. Try again in 60 seconds."},
            headers={"Retry-After": "60"},
        )
    _rate[ip].append(now)
    response = await call_next(request)
    return response


# ---------------------------------------------------------------------------
# Validation (v1 endpoints use inline; v2 uses validation.py)
# ---------------------------------------------------------------------------

VALID_SYMBOL = re.compile(r"^[A-Za-z0-9.\-]{1,10}$")
VALID_PERIODS = {"1d", "5d", "1mo", "6mo", "1y", "5y"}


def validate_symbol(symbol: str) -> str:
    s = symbol.strip().upper()
    if not VALID_SYMBOL.match(s):
        raise HTTPException(400, f"Invalid ticker symbol: '{symbol}'")
    return s


def validate_period(period: str) -> str:
    if period not in VALID_PERIODS:
        raise HTTPException(400, f"Invalid period: '{period}'. Allowed: {', '.join(sorted(VALID_PERIODS))}")
    return period


# ---------------------------------------------------------------------------
# v1 blocking data-fetch functions (run in thread pool)
# ---------------------------------------------------------------------------

def _fetch_quote_sync(sym: str) -> dict:
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


def _fetch_history_sync(sym: str, period: str) -> dict:
    ticker = yf.Ticker(sym)
    yf_period, interval = PERIOD_MAP.get(period, ("1mo", "1d"))
    hist = ticker.history(period=yf_period, interval=interval)

    if hist.empty:
        return None

    dates, opens, highs, lows, closes, volumes = [], [], [], [], [], []
    for idx, row in hist.iterrows():
        dates.append(idx.strftime("%Y-%m-%d %H:%M"))
        opens.append(round(float(row["Open"]), 2) if row["Open"] == row["Open"] else None)
        highs.append(round(float(row["High"]), 2) if row["High"] == row["High"] else None)
        lows.append(round(float(row["Low"]), 2) if row["Low"] == row["Low"] else None)
        closes.append(round(float(row["Close"]), 2) if row["Close"] == row["Close"] else None)
        volumes.append(int(row["Volume"]) if row["Volume"] == row["Volume"] else 0)

    return {
        "symbol": sym, "period": period,
        "dates": dates, "opens": opens, "highs": highs,
        "lows": lows, "closes": closes, "volumes": volumes,
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
async def search(q: str = Query(..., max_length=100)):
    key = f"search:{q}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    try:
        out = await run_in_thread(_search_sync, q)
    except Exception as e:
        out = {"results": [], "error": str(e)}
    cache.set(key, out, CACHE_TTLS["search"])
    return out


@app.get("/api/quote/{symbol}")
async def quote(symbol: str):
    sym = validate_symbol(symbol)
    key = f"quote:{sym}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    try:
        out = await run_in_thread(_fetch_quote_sync, sym)
        if out is None:
            raise HTTPException(404, f"No data found for ticker '{sym}'")
        cache.set(key, out, CACHE_TTLS["quote"])
        return out
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch quote: {e}")


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


PERIOD_MAP = {
    "1d":  ("1d",  "5m"),
    "5d":  ("5d",  "15m"),
    "1mo": ("1mo", "1h"),
    "6mo": ("6mo", "1d"),
    "1y":  ("1y",  "1d"),
    "5y":  ("5y",  "1wk"),
}


@app.get("/api/history/{symbol}")
async def history(symbol: str, period: str = "1mo"):
    sym = validate_symbol(symbol)
    period = validate_period(period)
    ttl = CACHE_TTLS["history_short"] if period in ("1d", "5d") else CACHE_TTLS["history_long"]
    key = f"history:{sym}:{period}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    try:
        out = await run_in_thread(_fetch_history_sync, sym, period)
        if out is None:
            raise HTTPException(404, f"No history data for '{sym}' (period={period})")
        cache.set(key, out, ttl)
        return out
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch history: {e}")


@app.get("/api/analysis/{symbol}")
async def analysis(symbol: str, period: str = "1y"):
    sym = validate_symbol(symbol)
    period = validate_period(period)
    key = f"analysis:{sym}:{period}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    hist = await history(sym, period)
    if "error" in hist:
        return hist
    out = compute_all(hist)
    cache.set(key, out, CACHE_TTLS["analysis"])
    return out


@app.get("/api/interpret/{symbol}")
async def interpret(symbol: str):
    sym = validate_symbol(symbol)
    key = f"interpret:{sym}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    quote_data = await quote(sym)
    if "error" in quote_data:
        return {"insights": ["Unable to generate analysis at this time."]}
    out = {"insights": generate_insights(quote_data)}
    cache.set(key, out, CACHE_TTLS["interpret"])
    return out


@app.get("/api/news/{symbol}")
async def news(symbol: str):
    sym = validate_symbol(symbol)
    key = f"news:{sym}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    try:
        out = await run_in_thread(_fetch_news_sync, sym)
    except Exception:
        out = {"articles": [], "symbol": sym}
    cache.set(key, out, CACHE_TTLS["news"])
    return out


@app.get("/api/glossary")
async def glossary():
    key = "glossary"
    hit = cache.get(key)
    if hit is not None:
        return hit
    out = {"terms": get_all_terms()}
    cache.set(key, out, CACHE_TTLS["glossary"])
    return out


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

app.include_router(snapshot_router)
app.include_router(history_router)
app.include_router(sentiment_router)
app.include_router(anomalies_router)
app.include_router(market_router)
app.include_router(watchlist_router)
app.include_router(websocket_router)


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

if _react_dir:
    # Serve static assets (JS, CSS, images) under /assets
    _assets_dir = _react_dir / "assets"
    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")

    # Serve other static files (favicon, etc.)
    @app.get("/favicon.svg")
    async def favicon():
        fav = _react_dir / "favicon.svg"
        if fav.exists():
            return FileResponse(str(fav), media_type="image/svg+xml")
        raise HTTPException(404)

    # SPA fallback — serve index.html for all non-API routes
    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        # Don't intercept API or WebSocket routes
        if full_path.startswith("api/") or full_path.startswith("ws/") or full_path.startswith("docs") or full_path.startswith("openapi"):
            raise HTTPException(404)
        # Try serving the exact file first
        file_path = _react_dir / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        # SPA: return index.html for client-side routing
        return FileResponse(str(_react_dir / "index.html"))

    log.info("react_frontend_mounted", path=str(_react_dir))
else:
    # Fallback: serve v1 vanilla JS frontend
    _v1_frontend = _api_dir / ".." / "src" / "frontend"
    if _v1_frontend.is_dir():
        app.mount("/", StaticFiles(directory=str(_v1_frontend), html=True), name="frontend")
        log.info("v1_frontend_mounted", path=str(_v1_frontend))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8089, log_level="warning")

"""
Stock Analyzer — FastAPI Backend (v2: AI Market Analyst)

Evolves v1 endpoints with ML intelligence layer, multi-source data ingestion,
WebSocket streaming, SQLite persistence, and watchlist management.

v1 Endpoints (preserved):
    GET /api/health          — Health check
    GET /api/search?q=       — Search tickers
    GET /api/quote/{symbol}  — Current quote + fundamentals
    GET /api/history/{symbol}— OHLCV price history
    GET /api/analysis/{symbol} — Technical indicators
    GET /api/interpret/{symbol} — Plain-English insights
    GET /api/news/{symbol}   — Recent news articles
    GET /api/glossary        — Educational glossary

v2 Endpoints (new):
    GET  /api/v1/symbols/{symbol}/snapshot  — Price + ML signals + sentiment
    GET  /api/v1/symbols/{symbol}/history   — OHLCV with structured data format
    GET  /api/v1/symbols/{symbol}/sentiment — Sentiment timeline (news + social)
    GET  /api/v1/anomalies                  — Recent anomaly detections
    GET  /api/v1/market/overview            — Sector heatmap + top movers
    GET  /api/v1/watchlist                  — User watchlist
    POST /api/v1/watchlist                  — Add/remove watchlist symbols
    WS   /ws/stream/{symbol}               — Real-time price push
"""

import os
import re
import sys
import time
import warnings
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"

# Ensure api/ is on the path for sibling imports
sys.path.insert(0, os.path.dirname(__file__))

import yfinance as yf

from analysis import compute_all
from interpreter import generate_insights
from glossary import get_all_terms, get_term
from config import CORS_ORIGINS, RATE_LIMIT, RATE_WINDOW, CACHE_TTLS
from cache import cache
from validation import validate_symbol as _validate_symbol, validate_period as _validate_period


# ---------------------------------------------------------------------------
# Database initialization on startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    from db.session import init_db
    init_db()
    yield


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="AI Market Analyst API",
    version="2.0.0",
    description="Multi-signal market intelligence — price, ML signals, sentiment, anomalies.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Rate limiter (60 req/min per IP — carried from v1)
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
# v1 validation helpers (kept for v1 endpoint compatibility)
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


# ===========================================================================
# v1 ENDPOINTS (preserved — same behavior as before)
# ===========================================================================

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


@app.get("/api/search")
def search(q: str = Query(..., max_length=100)):
    key = f"search:{q}"
    hit = cache.get(key)
    if hit is not None:
        return hit

    import urllib.request
    import urllib.parse
    import json

    try:
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
        out = {"results": results}
    except Exception as e:
        out = {"results": [], "error": str(e)}

    cache.set(key, out, CACHE_TTLS["search"])
    return out


@app.get("/api/quote/{symbol}")
def quote(symbol: str):
    sym = validate_symbol(symbol)
    key = f"quote:{sym}"
    hit = cache.get(key)
    if hit is not None:
        return hit

    try:
        ticker = yf.Ticker(sym)
        info = ticker.info
        price = (info.get("regularMarketPrice") or info.get("currentPrice")) if info else None

        if not info or not price:
            try:
                fi = ticker.fast_info
                if fi and hasattr(fi, "last_price") and fi.last_price:
                    out = {
                        "symbol": sym,
                        "name": sym,
                        "price": round(float(fi.last_price), 2),
                        "previousClose": round(float(fi.previous_close), 2) if hasattr(fi, "previous_close") and fi.previous_close else None,
                        "marketCap": int(fi.market_cap) if hasattr(fi, "market_cap") and fi.market_cap else None,
                        "volume": int(fi.last_volume) if hasattr(fi, "last_volume") and fi.last_volume else None,
                        "change": None, "changePercent": None,
                    }
                    cache.set(key, out, CACHE_TTLS["quote"])
                    return out
            except Exception:
                pass
            raise HTTPException(404, f"No data found for ticker '{sym}'")

        out = _build_quote(info, sym, price)
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
def history(symbol: str, period: str = "1mo"):
    sym = validate_symbol(symbol)
    period = validate_period(period)
    ttl = 60 if period in ("1d", "5d") else 300
    key = f"history:{sym}:{period}"
    hit = cache.get(key)
    if hit is not None:
        return hit

    try:
        ticker = yf.Ticker(sym)
        yf_period, interval = PERIOD_MAP.get(period, ("1mo", "1d"))
        hist = ticker.history(period=yf_period, interval=interval)

        if hist.empty:
            raise HTTPException(404, f"No history data for '{sym}' (period={period})")

        dates, opens, highs, lows, closes, volumes = [], [], [], [], [], []
        for idx, row in hist.iterrows():
            dates.append(idx.strftime("%Y-%m-%d %H:%M"))
            opens.append(round(float(row["Open"]), 2) if row["Open"] == row["Open"] else None)
            highs.append(round(float(row["High"]), 2) if row["High"] == row["High"] else None)
            lows.append(round(float(row["Low"]), 2) if row["Low"] == row["Low"] else None)
            closes.append(round(float(row["Close"]), 2) if row["Close"] == row["Close"] else None)
            volumes.append(int(row["Volume"]) if row["Volume"] == row["Volume"] else 0)

        out = {
            "symbol": sym,
            "period": period,
            "dates": dates,
            "opens": opens,
            "highs": highs,
            "lows": lows,
            "closes": closes,
            "volumes": volumes,
        }
        cache.set(key, out, ttl)
        return out
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch history: {e}")


@app.get("/api/analysis/{symbol}")
def analysis(symbol: str, period: str = "1y"):
    sym = validate_symbol(symbol)
    period = validate_period(period)
    key = f"analysis:{sym}:{period}"
    hit = cache.get(key)
    if hit is not None:
        return hit

    hist = history(sym, period)
    if "error" in hist:
        return hist

    out = compute_all(hist)
    cache.set(key, out, CACHE_TTLS["analysis"])
    return out


@app.get("/api/interpret/{symbol}")
def interpret(symbol: str):
    sym = validate_symbol(symbol)
    key = f"interpret:{sym}"
    hit = cache.get(key)
    if hit is not None:
        return hit

    quote_data = quote(sym)
    if "error" in quote_data:
        return {"insights": ["Unable to generate analysis at this time."]}

    out = {"insights": generate_insights(quote_data)}
    cache.set(key, out, CACHE_TTLS["interpret"])
    return out


@app.get("/api/news/{symbol}")
def news(symbol: str):
    sym = validate_symbol(symbol)
    key = f"news:{sym}"
    hit = cache.get(key)
    if hit is not None:
        return hit

    try:
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
        out = {"articles": articles, "symbol": sym}
    except Exception:
        out = {"articles": [], "symbol": sym}

    cache.set(key, out, CACHE_TTLS["news"])
    return out


@app.get("/api/glossary")
def glossary():
    key = "glossary"
    hit = cache.get(key)
    if hit is not None:
        return hit

    out = {"terms": get_all_terms()}
    cache.set(key, out, CACHE_TTLS["glossary"])
    return out


# ===========================================================================
# v2 ROUTES (mounted from route modules)
# ===========================================================================

from routes.snapshot import router as snapshot_router
from routes.history import router as history_v2_router
from routes.sentiment import router as sentiment_router
from routes.anomalies import router as anomalies_router
from routes.market import router as market_router
from routes.watchlist import router as watchlist_router
from routes.websocket import router as websocket_router

app.include_router(snapshot_router)
app.include_router(history_v2_router)
app.include_router(sentiment_router)
app.include_router(anomalies_router)
app.include_router(market_router)
app.include_router(watchlist_router)
app.include_router(websocket_router)


# ---------------------------------------------------------------------------
# Serve frontend static files (for local/Docker use)
# ---------------------------------------------------------------------------

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

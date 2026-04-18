"""
GET /api/v1/symbols/{symbol}/snapshot
Current price + ML signals + sentiment — the flagship v2 endpoint.
"""

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf
from fastapi import APIRouter, HTTPException

from cache import cache
from config import CACHE_TTLS
from validation import validate_symbol
from ingestion import news as news_source

# Add ml/ to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from ml.trend import classifier as trend_classifier
from ml.anomaly import detector as anomaly_detector
from ml.sentiment import scorer as sentiment_scorer

router = APIRouter(prefix="/api/v1/symbols", tags=["v2-intelligence"])


def _fetch_quote_sync(symbol: str) -> dict | None:
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        price = (info.get("regularMarketPrice") or info.get("currentPrice")) if info else None
        if not price:
            fi = ticker.fast_info
            if fi and hasattr(fi, "last_price") and fi.last_price:
                return {
                    "current": round(float(fi.last_price), 2),
                    "change_pct": None,
                    "volume": int(fi.last_volume) if hasattr(fi, "last_volume") and fi.last_volume else 0,
                    "previous_close": round(float(fi.previous_close), 2) if hasattr(fi, "previous_close") and fi.previous_close else None,
                }
            return None

        prev = info.get("regularMarketPreviousClose") or info.get("previousClose")
        change_pct = round(((price - prev) / prev) * 100, 2) if prev and prev != 0 else None

        return {
            "current": round(float(price), 2),
            "change_pct": change_pct,
            "volume": info.get("regularMarketVolume") or info.get("volume") or 0,
            "previous_close": prev,
        }
    except Exception:
        return None


def _compute_ml_signals(symbol: str) -> dict:
    """Compute ML-powered trend + anomaly signals from recent price history."""
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="3mo", interval="1d")
        if hist.empty or len(hist) < 20:
            return {
                "trend": "insufficient_data",
                "trend_confidence": 0.0,
                "anomaly_score": 0.0,
                "anomaly_flag": False,
                "probabilities": {},
            }

        df = hist.rename(columns={
            "Open": "open", "High": "high", "Low": "low",
            "Close": "close", "Volume": "volume",
        })

        # Trend classification (ML model or rule-based fallback)
        trend_result = trend_classifier.predict(df)

        # Anomaly detection (Isolation Forest)
        anomaly_result = anomaly_detector.detect(df, symbol=symbol)

        return {
            "trend": trend_result["trend"],
            "trend_confidence": trend_result["trend_confidence"],
            "anomaly_score": anomaly_result["anomaly_score"],
            "anomaly_flag": anomaly_result["anomaly_flag"],
            "anomaly_features": anomaly_result.get("features", {}),
            "probabilities": trend_result.get("probabilities", {}),
            "method": trend_result.get("method", "ml_model"),
        }
    except Exception:
        return {
            "trend": "unavailable",
            "trend_confidence": 0.0,
            "anomaly_score": 0.0,
            "anomaly_flag": False,
        }


def _score_headlines(headlines: list[dict]) -> dict:
    """Score news headlines with the sentiment model."""
    if not headlines:
        return {"news_score": None, "social_score": None, "composite": None, "sample_size": 0}

    texts = [h.get("title", "") for h in headlines if h.get("title")]
    if not texts:
        return {"news_score": None, "social_score": None, "composite": None, "sample_size": 0}

    results = sentiment_scorer.score_batch(texts)
    aggregate = sentiment_scorer.aggregate(results)

    return {
        "news_score": aggregate["score"],
        "social_score": None,  # Populated when Reddit data available
        "composite": aggregate["score"],
        "label": aggregate["label"],
        "confidence": aggregate["confidence"],
        "sample_size": aggregate["count"],
        "method": aggregate["method"],
        "distribution": aggregate.get("distribution", {}),
    }


@router.get("/{symbol}/snapshot")
async def snapshot(symbol: str):
    sym = validate_symbol(symbol)
    key = f"snapshot:{sym}"
    hit = cache.get(key)
    if hit is not None:
        return hit

    loop = asyncio.get_event_loop()

    # Fetch price, ML signals, and news in parallel
    price_task = loop.run_in_executor(None, _fetch_quote_sync, sym)
    signals_task = loop.run_in_executor(None, _compute_ml_signals, sym)
    news_task = news_source.fetch_news_headlines(sym, limit=10)

    price_data, signals, headlines = await asyncio.gather(price_task, signals_task, news_task)

    if price_data is None:
        raise HTTPException(404, f"No data found for ticker '{sym}'")

    # Score headlines with sentiment model (also from yfinance news if no API key)
    if not headlines:
        try:
            ticker = yf.Ticker(sym)
            raw_news = ticker.news or []
            headlines = [
                {"title": (item.get("content", {}).get("title") or item.get("title", ""))}
                for item in raw_news[:10]
                if isinstance(item, dict)
            ]
        except Exception:
            headlines = []

    sentiment = _score_headlines(headlines)

    result = {
        "symbol": sym,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "price": price_data,
        "signals": signals,
        "sentiment": sentiment,
        "disclaimer": "This tool provides data analysis and is not financial advice.",
    }

    cache.set(key, result, CACHE_TTLS["snapshot"])
    return result

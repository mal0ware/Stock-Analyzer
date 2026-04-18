"""
GET /api/v1/symbols/{symbol}/sentiment
Sentiment timeline — news + social scores over time.
"""

import sys
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from cache import cache
from config import CACHE_TTLS
from db.session import get_db
from db.models import SentimentRecord
from validation import validate_symbol
from ingestion import news as news_source, reddit as reddit_source

# Add ml/ to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from ml.sentiment import scorer as sentiment_scorer

router = APIRouter(prefix="/api/v1/symbols", tags=["v2-intelligence"])


@router.get("/{symbol}/sentiment")
async def sentiment(symbol: str, period: str = "7d", db: Session = Depends(get_db)):
    sym = validate_symbol(symbol)
    key = f"sentiment:{sym}:{period}"
    hit = cache.get(key)
    if hit is not None:
        return hit

    # Fetch from external sources (graceful fallback when keys missing)
    headlines = await news_source.fetch_news_headlines(sym, limit=20)
    reddit_posts = await reddit_source.fetch_reddit_posts(sym, limit=25)

    # Score news headlines
    news_texts = [h.get("title", "") for h in headlines if h.get("title")]
    news_results = sentiment_scorer.score_batch(news_texts) if news_texts else []
    news_aggregate = sentiment_scorer.aggregate(news_results)

    # Score Reddit posts
    reddit_texts = [p.get("title", "") for p in reddit_posts if p.get("title")]
    reddit_results = sentiment_scorer.score_batch(reddit_texts) if reddit_texts else []
    reddit_aggregate = sentiment_scorer.aggregate(reddit_results)

    # Composite: weighted average of news and social (news weighted 60%, social 40%)
    composite = None
    if news_aggregate["score"] is not None and reddit_aggregate["score"] is not None:
        composite = round(news_aggregate["score"] * 0.6 + reddit_aggregate["score"] * 0.4, 3)
    elif news_aggregate["score"] is not None:
        composite = news_aggregate["score"]
    elif reddit_aggregate["score"] is not None:
        composite = reddit_aggregate["score"]

    # Query persisted sentiment records from DB
    records = (
        db.query(SentimentRecord)
        .filter(SentimentRecord.symbol == sym)
        .order_by(SentimentRecord.recorded_at.desc())
        .limit(100)
        .all()
    )

    timeline = [
        {
            "source": r.source,
            "score": r.score,
            "label": r.label,
            "confidence": r.confidence,
            "recorded_at": r.recorded_at,
        }
        for r in records
    ]

    result = {
        "symbol": sym,
        "period": period,
        "news": {
            "available": await news_source.is_available(),
            "headline_count": len(headlines),
            "headlines": headlines[:5],
            "score": news_aggregate["score"],
            "label": news_aggregate["label"],
            "distribution": news_aggregate.get("distribution", {}),
            "method": news_aggregate.get("method", "none"),
        },
        "social": {
            "available": await reddit_source.is_available(),
            "post_count": len(reddit_posts),
            "posts": reddit_posts[:5],
            "score": reddit_aggregate["score"],
            "label": reddit_aggregate["label"],
            "distribution": reddit_aggregate.get("distribution", {}),
            "method": reddit_aggregate.get("method", "none"),
        },
        "composite_score": composite,
        "timeline": timeline,
    }

    cache.set(key, result, CACHE_TTLS["sentiment"])
    return result

"""
Reddit sentiment data source — requires REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET env vars.
Graceful fallback: returns empty list when credentials are missing.
"""

import os
from datetime import datetime, timezone

REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET")
REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT", "StockAnalyzer/2.0")

SUBREDDITS = ["wallstreetbets", "stocks", "investing"]


async def fetch_reddit_posts(symbol: str, limit: int = 25) -> list[dict]:
    """
    Fetch recent Reddit posts mentioning a symbol.
    Returns empty list if Reddit credentials are not set.
    """
    if not REDDIT_CLIENT_ID or not REDDIT_CLIENT_SECRET:
        return []

    try:
        import praw

        reddit = praw.Reddit(
            client_id=REDDIT_CLIENT_ID,
            client_secret=REDDIT_CLIENT_SECRET,
            user_agent=REDDIT_USER_AGENT,
        )

        posts = []
        for sub_name in SUBREDDITS:
            subreddit = reddit.subreddit(sub_name)
            for post in subreddit.search(symbol, sort="new", time_filter="week", limit=limit):
                posts.append({
                    "title": post.title,
                    "score": post.score,
                    "num_comments": post.num_comments,
                    "subreddit": sub_name,
                    "created_utc": datetime.fromtimestamp(post.created_utc, tz=timezone.utc).isoformat(),
                    "url": f"https://reddit.com{post.permalink}",
                })
        return posts
    except ImportError:
        return []
    except Exception:
        return []


async def is_available() -> bool:
    """Check if Reddit API credentials are configured."""
    return REDDIT_CLIENT_ID is not None and REDDIT_CLIENT_SECRET is not None

#!/usr/bin/env python3
"""
News fetcher for stock-related headlines.
Uses yfinance's built-in news feature.
Outputs JSON to stdout. All errors are returned as {"articles": [], "error": "..."}.

stderr is suppressed to prevent yfinance warnings from leaking into
the parent process — defense-in-depth alongside the C++ stderr separation.
"""

import sys
import os
import json
import re
import warnings

# Suppress warnings before importing yfinance
warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"

import yfinance as yf


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

VALID_SYMBOL = re.compile(r"^[A-Za-z0-9.\-]{1,10}$")


def validate_symbol(s: str) -> str:
    """Validate and normalize a ticker symbol."""
    s = s.strip().upper()
    if not VALID_SYMBOL.match(s):
        raise ValueError(f"Invalid ticker symbol: '{s}'. Use 1-10 alphanumeric characters, dots, or hyphens.")
    return s


# ---------------------------------------------------------------------------
# News fetcher
# ---------------------------------------------------------------------------

def fetch_news(ticker_symbol: str) -> dict:
    """
    Fetch recent news articles for a ticker.
    Always returns {"articles": [...], "symbol": "..."} — never raises.
    """
    try:
        ticker = yf.Ticker(ticker_symbol)
        news = ticker.news

        if not news:
            return {"articles": [], "symbol": ticker_symbol.upper()}

        articles = []
        for item in news[:8]:
            content = item.get("content", {})
            article = {
                "title": content.get("title", item.get("title", "No title")),
                "publisher": content.get("provider", {}).get("displayName", "Unknown"),
                "link": content.get("canonicalUrl", {}).get("url", ""),
                "publishedAt": content.get("pubDate", ""),
            }

            # Get thumbnail if available
            thumbnail = content.get("thumbnail")
            if thumbnail and isinstance(thumbnail, dict):
                resolutions = thumbnail.get("resolutions", [])
                if resolutions:
                    article["thumbnail"] = resolutions[0].get("url", "")

            articles.append(article)

        return {"articles": articles, "symbol": ticker_symbol.upper()}

    except Exception as e:
        return {
            "articles": [],
            "symbol": ticker_symbol.upper(),
            "error": f"Failed to fetch news for '{ticker_symbol}': {type(e).__name__}: {e}",
        }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: news_fetcher.py <ticker>"}))
        sys.exit(1)

    try:
        ticker_symbol = validate_symbol(sys.argv[1])
    except ValueError as e:
        print(json.dumps({"articles": [], "error": str(e)}))
        sys.exit(1)

    result = fetch_news(ticker_symbol)
    print(json.dumps(result))


if __name__ == "__main__":
    main()

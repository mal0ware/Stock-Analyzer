#!/usr/bin/env python3
"""
News fetcher for stock-related headlines.
Uses yfinance's built-in news feature.
Outputs JSON to stdout.
"""

import sys
import json
import yfinance as yf


def fetch_news(ticker_symbol: str) -> dict:
    """Fetch recent news for a ticker."""
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
        return {"articles": [], "symbol": ticker_symbol.upper(), "error": str(e)}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: news_fetcher.py <ticker>"}))
        sys.exit(1)

    ticker_symbol = sys.argv[1]
    result = fetch_news(ticker_symbol)
    print(json.dumps(result))


if __name__ == "__main__":
    main()

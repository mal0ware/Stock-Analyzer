#!/usr/bin/env python3
"""
Stock data fetcher using yfinance.
Called by the C++ backend as a subprocess.
Outputs JSON to stdout.
"""

import sys
import json
import yfinance as yf
from datetime import datetime, timedelta


def fetch_quote(ticker_symbol: str) -> dict:
    """Fetch current quote and company info."""
    try:
        ticker = yf.Ticker(ticker_symbol)
        info = ticker.info

        if not info or info.get("trailingPegRatio") is None and info.get("regularMarketPrice") is None:
            # Try fast_info as fallback
            fi = ticker.fast_info
            if fi is None:
                return {"error": f"No data found for '{ticker_symbol}'"}

        result = {
            "symbol": info.get("symbol", ticker_symbol.upper()),
            "name": info.get("shortName") or info.get("longName", ticker_symbol.upper()),
            "price": info.get("regularMarketPrice") or info.get("currentPrice"),
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
        }

        # Calculate change and percent change
        if result["price"] and result["previousClose"]:
            result["change"] = round(result["price"] - result["previousClose"], 2)
            result["changePercent"] = round(
                (result["change"] / result["previousClose"]) * 100, 2
            )
        else:
            result["change"] = None
            result["changePercent"] = None

        return result

    except Exception as e:
        return {"error": str(e)}


def fetch_history(ticker_symbol: str, period: str) -> dict:
    """Fetch historical OHLCV data."""
    try:
        ticker = yf.Ticker(ticker_symbol)

        period_map = {
            "1d": ("1d", "5m"),
            "5d": ("5d", "15m"),
            "1mo": ("1mo", "1h"),
            "6mo": ("6mo", "1d"),
            "1y": ("1y", "1d"),
            "5y": ("5y", "1wk"),
        }

        yf_period, interval = period_map.get(period, ("1mo", "1d"))
        hist = ticker.history(period=yf_period, interval=interval)

        if hist.empty:
            return {"error": f"No history data for '{ticker_symbol}'"}

        dates = []
        opens = []
        highs = []
        lows = []
        closes = []
        volumes = []

        for idx, row in hist.iterrows():
            dates.append(idx.strftime("%Y-%m-%d %H:%M"))
            opens.append(round(float(row["Open"]), 2) if row["Open"] == row["Open"] else None)
            highs.append(round(float(row["High"]), 2) if row["High"] == row["High"] else None)
            lows.append(round(float(row["Low"]), 2) if row["Low"] == row["Low"] else None)
            closes.append(round(float(row["Close"]), 2) if row["Close"] == row["Close"] else None)
            volumes.append(int(row["Volume"]) if row["Volume"] == row["Volume"] else 0)

        return {
            "symbol": ticker_symbol.upper(),
            "period": period,
            "dates": dates,
            "opens": opens,
            "highs": highs,
            "lows": lows,
            "closes": closes,
            "volumes": volumes,
        }

    except Exception as e:
        return {"error": str(e)}


def search_ticker(query: str) -> dict:
    """Search for ticker symbols matching a query."""
    try:
        import urllib.request
        import urllib.parse

        url = f"https://query2.finance.yahoo.com/v1/finance/search?q={urllib.parse.quote(query)}&quotesCount=6&newsCount=0"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())

        results = []
        for quote in data.get("quotes", []):
            if quote.get("quoteType") in ("EQUITY", "ETF"):
                results.append({
                    "symbol": quote.get("symbol", ""),
                    "name": quote.get("shortname") or quote.get("longname", ""),
                    "exchange": quote.get("exchange", ""),
                    "type": quote.get("quoteType", ""),
                })

        return {"results": results}

    except Exception as e:
        return {"results": [], "error": str(e)}


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: data_fetcher.py <command> <args>"}))
        sys.exit(1)

    command = sys.argv[1]
    arg = sys.argv[2]

    if command == "quote":
        result = fetch_quote(arg)
    elif command == "history":
        period = sys.argv[3] if len(sys.argv) > 3 else "1mo"
        result = fetch_history(arg, period)
    elif command == "search":
        result = search_ticker(arg)
    else:
        result = {"error": f"Unknown command: {command}"}

    print(json.dumps(result))


if __name__ == "__main__":
    main()

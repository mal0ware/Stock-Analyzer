#!/usr/bin/env python3
"""
Stock data fetcher using yfinance.
Called by the C++ backend as a subprocess.
Outputs JSON to stdout.
"""

import sys
import json
import re
import yfinance as yf
from datetime import datetime, timedelta

# Input validation (defense-in-depth alongside C++ validation)
VALID_SYMBOL = re.compile(r'^[A-Za-z0-9.\-]{1,10}$')
VALID_PERIODS = {'1d', '5d', '1mo', '6mo', '1y', '5y'}
MAX_QUERY_LENGTH = 100


def validate_symbol(s: str) -> str:
    """Validate and normalize a ticker symbol."""
    s = s.strip().upper()
    if not VALID_SYMBOL.match(s):
        raise ValueError(f"Invalid ticker symbol: {s!r}")
    return s


def validate_period(s: str) -> str:
    """Validate a period parameter against allowed values."""
    if s not in VALID_PERIODS:
        raise ValueError(f"Invalid period: {s!r}")
    return s


def fetch_quote(ticker_symbol: str) -> dict:
    """Fetch current quote and company info."""
    try:
        ticker = yf.Ticker(ticker_symbol)
        info = ticker.info

        if not info or (not info.get("regularMarketPrice") and not info.get("currentPrice")):
            # ticker.info came back empty or without a price — try fast_info
            try:
                fi = ticker.fast_info
                if fi and hasattr(fi, 'last_price') and fi.last_price:
                    # Populate minimal result from fast_info
                    return {
                        "symbol": ticker_symbol.upper(),
                        "name": ticker_symbol.upper(),
                        "price": round(float(fi.last_price), 2) if fi.last_price else None,
                        "previousClose": round(float(fi.previous_close), 2) if hasattr(fi, 'previous_close') and fi.previous_close else None,
                        "marketCap": int(fi.market_cap) if hasattr(fi, 'market_cap') and fi.market_cap else None,
                        "volume": int(fi.last_volume) if hasattr(fi, 'last_volume') and fi.last_volume else None,
                        "change": None, "changePercent": None,
                    }
            except Exception:
                pass
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
            # Company profile
            "description": info.get("longBusinessSummary", ""),
            "website": info.get("website", ""),
            "fullTimeEmployees": info.get("fullTimeEmployees"),
            # Analyst data
            "recommendationKey": info.get("recommendationKey", ""),
            "recommendationMean": info.get("recommendationMean"),
            "targetHighPrice": info.get("targetHighPrice"),
            "targetLowPrice": info.get("targetLowPrice"),
            "targetMeanPrice": info.get("targetMeanPrice"),
            "targetMedianPrice": info.get("targetMedianPrice"),
            "numberOfAnalystOpinions": info.get("numberOfAnalystOpinions"),
            # Growth metrics
            "revenueGrowth": info.get("revenueGrowth"),
            "earningsGrowth": info.get("earningsGrowth"),
            "grossMargins": info.get("grossMargins"),
            "operatingMargins": info.get("operatingMargins"),
            "totalRevenue": info.get("totalRevenue"),
            "totalDebt": info.get("totalDebt"),
            "freeCashflow": info.get("freeCashflow"),
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

        # Validate query length
        if len(query) > MAX_QUERY_LENGTH:
            return {"results": [], "error": "Query too long"}

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

    try:
        if command == "quote":
            result = fetch_quote(validate_symbol(arg))
        elif command == "history":
            period = validate_period(sys.argv[3] if len(sys.argv) > 3 else "1mo")
            result = fetch_history(validate_symbol(arg), period)
        elif command == "search":
            result = search_ticker(arg)
        else:
            result = {"error": f"Unknown command: {command!r}"}
    except ValueError as e:
        result = {"error": str(e)}

    print(json.dumps(result))


if __name__ == "__main__":
    main()

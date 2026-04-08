#!/usr/bin/env python3
"""
Stock data service — persistent subprocess that handles requests over stdin/stdout.

Instead of spawning a new Python process for each API call (which costs ~500ms
for Python startup + yfinance import), this service starts once and handles
requests as JSON lines over stdin/stdout.

Protocol:
    Input  (stdin):  One JSON object per line: {"cmd": "quote", "args": ["AAPL"]}
    Output (stdout): One JSON object per line with the result

Commands:
    quote <symbol>              — Current quote + fundamentals
    history <symbol> <period>   — OHLCV price history
    search <query>              — Search for tickers
    news <symbol>               — Recent news articles
    ping                        — Health check (returns {"status":"ok"})
"""

import sys
import os
import json
import re
import warnings
import threading

# Suppress all Python warnings before importing yfinance.
warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"

try:
    import yfinance as yf
except Exception as _import_err:
    # Write error and exit — parent will fall back to per-request subprocess
    sys.stdout.write(json.dumps({"error": f"Failed to import yfinance: {_import_err}"}) + "\n")
    sys.stdout.flush()
    sys.exit(1)

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

VALID_SYMBOL = re.compile(r"^[A-Za-z0-9.\-]{1,10}$")
VALID_PERIODS = {"1d", "5d", "1mo", "6mo", "1y", "5y"}

PERIOD_MAP = {
    "1d":  ("1d",  "5m"),
    "5d":  ("5d",  "15m"),
    "1mo": ("1mo", "1h"),
    "6mo": ("6mo", "1d"),
    "1y":  ("1y",  "1d"),
    "5y":  ("5y",  "1wk"),
}

def validate_symbol(s):
    s = s.strip().upper()
    if not VALID_SYMBOL.match(s):
        raise ValueError(f"Invalid ticker symbol: '{s}'")
    return s

def validate_period(s):
    if s not in VALID_PERIODS:
        raise ValueError(f"Invalid period: '{s}'")
    return s

# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

def handle_quote(args):
    sym = validate_symbol(args[0])
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
        return {"error": f"No data found for ticker '{sym}'."}

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


def handle_history(args):
    sym = validate_symbol(args[0])
    period = validate_period(args[1] if len(args) > 1 else "1mo")
    ticker = yf.Ticker(sym)
    yf_period, interval = PERIOD_MAP.get(period, ("1mo", "1d"))
    hist = ticker.history(period=yf_period, interval=interval)

    if hist.empty:
        return {"error": f"No history data for '{sym}' (period={period})."}

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


def handle_search(args):
    import urllib.request
    import urllib.parse

    query = " ".join(args)
    if len(query) > 100:
        return {"results": [], "error": "Query too long."}

    url = f"https://query2.finance.yahoo.com/v1/finance/search?q={urllib.parse.quote(query)}&quotesCount=6&newsCount=0"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read().decode())

    results = [
        {
            "symbol": q.get("symbol", ""),
            "name": q.get("shortname") or q.get("longname", ""),
            "exchange": q.get("exchange", ""),
            "type": q.get("quoteType", ""),
        }
        for q in data.get("quotes", [])
        if q.get("quoteType") in ("EQUITY", "ETF")
    ]
    return {"results": results}


def handle_news(args):
    sym = validate_symbol(args[0])
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


HANDLERS = {
    "quote": handle_quote,
    "history": handle_history,
    "search": handle_search,
    "news": handle_news,
}


# ---------------------------------------------------------------------------
# Main loop — read JSON lines from stdin, dispatch, write JSON lines to stdout
# ---------------------------------------------------------------------------

def main():
    # Signal readiness
    sys.stdout.write(json.dumps({"status": "ready"}) + "\n")
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            cmd = request.get("cmd", "")
            args = request.get("args", [])

            if cmd == "ping":
                result = {"status": "ok"}
            elif cmd in HANDLERS:
                result = HANDLERS[cmd](args)
            else:
                result = {"error": f"Unknown command: '{cmd}'"}

        except json.JSONDecodeError as e:
            result = {"error": f"Invalid JSON: {e}"}
        except ValueError as e:
            result = {"error": str(e)}
        except Exception as e:
            result = {"error": f"{type(e).__name__}: {e}"}

        sys.stdout.write(json.dumps(result) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()

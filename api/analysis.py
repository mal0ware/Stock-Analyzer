"""
Technical analysis engine — Python port of the C++ analysis module.
Computes SMA, EMA, RSI, MACD, volatility, trend, support/resistance.
"""

import math


def sma(prices: list[float], period: int) -> list[float]:
    if len(prices) < period:
        return []
    result = []
    s = sum(prices[:period])
    result.append(s / period)
    for i in range(period, len(prices)):
        s += prices[i] - prices[i - period]
        result.append(s / period)
    return result


def ema(prices: list[float], period: int) -> list[float]:
    if len(prices) < period:
        return []
    s = sum(prices[:period])
    ema_val = s / period
    result = [ema_val]
    multiplier = 2.0 / (period + 1)
    for i in range(period, len(prices)):
        ema_val = (prices[i] - ema_val) * multiplier + ema_val
        result.append(ema_val)
    return result


def rsi(prices: list[float], period: int = 14) -> list[float]:
    if len(prices) < period + 1:
        return []

    gains = []
    losses = []
    for i in range(1, len(prices)):
        change = prices[i] - prices[i - 1]
        gains.append(change if change > 0 else 0.0)
        losses.append(-change if change < 0 else 0.0)

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    result = []
    if avg_loss == 0:
        result.append(100.0)
    else:
        rs = avg_gain / avg_loss
        result.append(100.0 - (100.0 / (1.0 + rs)))

    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            result.append(100.0)
        else:
            rs = avg_gain / avg_loss
            result.append(100.0 - (100.0 / (1.0 + rs)))

    return result


def macd(prices: list[float], fast: int = 12, slow: int = 26, signal_period: int = 9) -> dict:
    fast_ema = ema(prices, fast)
    slow_ema = ema(prices, slow)

    if not fast_ema or not slow_ema:
        return {"macd": [], "signal": [], "histogram": []}

    offset = slow - fast
    macd_line = [fast_ema[i + offset] - slow_ema[i] for i in range(len(slow_ema))]
    signal_line = ema(macd_line, signal_period)

    if not signal_line:
        return {"macd": [], "signal": [], "histogram": []}

    sig_offset = len(macd_line) - len(signal_line)
    result_macd = []
    result_signal = []
    result_hist = []

    for i in range(len(signal_line)):
        m = macd_line[i + sig_offset]
        s = signal_line[i]
        result_macd.append(round(m, 2))
        result_signal.append(round(s, 2))
        result_hist.append(round(m - s, 2))

    return {"macd": result_macd, "signal": result_signal, "histogram": result_hist}


def volatility(prices: list[float], period: int = 0) -> float:
    if len(prices) < 2:
        return 0.0

    n = min(period, len(prices) - 1) if period > 0 else len(prices) - 1
    start = max(0, len(prices) - n - 1)

    returns = []
    for i in range(start + 1, len(prices)):
        if prices[i - 1] != 0:
            returns.append((prices[i] - prices[i - 1]) / prices[i - 1])

    if not returns:
        return 0.0

    mean = sum(returns) / len(returns)
    sq_sum = sum((r - mean) ** 2 for r in returns)
    return math.sqrt(sq_sum / len(returns)) * 100.0


def detect_trend(prices: list[float]) -> str:
    if len(prices) < 5:
        return "insufficient_data"

    n = len(prices)
    sum_x = sum(range(n))
    sum_y = sum(prices)
    sum_xy = sum(i * p for i, p in enumerate(prices))
    sum_x2 = sum(i * i for i in range(n))

    denom = n * sum_x2 - sum_x * sum_x
    if denom == 0:
        return "sideways"

    slope = (n * sum_xy - sum_x * sum_y) / denom
    avg_price = sum_y / n

    if avg_price == 0:
        return "sideways"

    normalized_slope = (slope / avg_price) * 100.0 * n

    if normalized_slope > 3.0:
        return "uptrend"
    if normalized_slope < -3.0:
        return "downtrend"
    return "sideways"


def support_resistance(highs: list[float], lows: list[float]) -> dict:
    if not highs or not lows:
        return {"support": None, "resistance": None}

    lookback = min(20, len(highs))
    min_low = min(lows[-lookback:])
    max_high = max(highs[-lookback:])

    return {
        "support": round(min_low, 2),
        "resistance": round(max_high, 2),
    }


def compute_all(history_data: dict) -> dict:
    """Compute all technical indicators from OHLCV history data."""
    closes = history_data.get("closes", [])
    if not closes:
        return {"error": "No price data available for analysis"}

    # Replace None with 0.0
    closes = [c if c is not None else 0.0 for c in closes]
    highs = [h if h is not None else 0.0 for h in history_data.get("highs", [])]
    lows = [lo if lo is not None else 0.0 for lo in history_data.get("lows", [])]

    sma20 = sma(closes, 20)
    sma50 = sma(closes, 50)
    sma200 = sma(closes, 200)

    ema12 = ema(closes, 12)
    ema26 = ema(closes, 26)

    rsi_values = rsi(closes, 14)

    result = {
        "sma20": sma20,
        "sma50": sma50,
        "sma200": sma200,
        "ema12": ema12,
        "ema26": ema26,
        "rsi": rsi_values,
        "currentRsi": round(rsi_values[-1], 2) if rsi_values else None,
        "macd": macd(closes),
        "volatility": round(volatility(closes), 2),
        "trend": detect_trend(closes),
    }

    if highs and lows:
        result["supportResistance"] = support_resistance(highs, lows)

    if len(closes) >= 2 and closes[0] != 0:
        result["periodReturn"] = round(((closes[-1] - closes[0]) / closes[0]) * 100, 2)

    return result

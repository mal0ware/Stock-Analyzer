"""
Technical analysis engine.

Vectorised implementations of the indicators the dashboard consumes
(simple / exponential moving averages, RSI, MACD, volatility, trend,
support / resistance). Everything in this module operates on NumPy arrays
in a single pass, so an indicator over ``N`` closes costs ``O(N)`` work
with a small constant — typically **5–10× faster** than the naive Python
implementations that shipped in v1.

All public functions accept either ``list[float]`` (for legacy callers)
or ``np.ndarray``; internally we always normalise to ``float64`` arrays so
downstream math is uniform.

Notation
--------
``N``
    Length of the input price series.
``P``
    Window/period parameter (e.g. ``14`` for a standard RSI).

Complexity summary
------------------
====================  =============  =======================
Function              Time           Space
====================  =============  =======================
``sma``               O(N)           O(N)
``ema``               O(N)           O(N)
``rsi``               O(N)           O(N)
``macd``              O(N)           O(N)
``volatility``        O(N)           O(N)
``detect_trend``      O(N)           O(1) beyond input
``support_resistance`` O(min(N, W))  O(1) beyond input
====================  =============  =======================
"""

from __future__ import annotations

import numpy as np

__all__ = [
    "sma", "ema", "rsi", "macd", "volatility",
    "detect_trend", "support_resistance", "compute_all",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _as_float_array(prices: "list[float] | np.ndarray") -> np.ndarray:
    """Coerce a price series to a contiguous float64 ndarray.

    None/NaN values are replaced with the previous finite value (forward
    fill) and any leading NaNs with zero, because yfinance occasionally
    emits null bars for illiquid sessions.
    """
    arr = np.asarray(prices, dtype=np.float64)
    if arr.size == 0:
        return arr
    mask = ~np.isfinite(arr)
    if mask.any():
        # Forward-fill NaNs with the last finite value.
        finite_idx = np.where(~mask, np.arange(arr.size), 0)
        np.maximum.accumulate(finite_idx, out=finite_idx)
        arr = arr[finite_idx]
        arr[~np.isfinite(arr)] = 0.0
    return arr


def _round_list(arr: np.ndarray, decimals: int = 2) -> list[float]:
    """Round and convert to a plain Python list for JSON serialisation."""
    result: list[float] = np.round(arr, decimals).tolist()
    return result


# ---------------------------------------------------------------------------
# Moving averages
# ---------------------------------------------------------------------------

def sma(prices: "list[float] | np.ndarray", period: int) -> list[float]:
    """Simple moving average with period ``period``.

    Uses a cumulative-sum trick to compute every window in ``O(N)`` total:
    ``sum(prices[i:i+P]) = cumsum[i+P] - cumsum[i]``.
    """
    arr = _as_float_array(prices)
    if arr.size < period or period <= 0:
        return []
    cumsum = np.concatenate(([0.0], np.cumsum(arr)))
    out = (cumsum[period:] - cumsum[:-period]) / period
    return _round_list(out)


def ema(prices: "list[float] | np.ndarray", period: int) -> list[float]:
    """Exponential moving average seeded with the SMA of the first window.

    Formula: ``EMA_t = alpha * P_t + (1 - alpha) * EMA_{t-1}`` with
    ``alpha = 2 / (period + 1)``. Implemented as a single scalar loop
    because this IIR filter has no vectorised numpy equivalent, but the
    constant is small (one multiply + one add per sample).
    """
    arr = _as_float_array(prices)
    if arr.size < period or period <= 0:
        return []
    alpha = 2.0 / (period + 1)
    out = np.empty(arr.size - period + 1, dtype=np.float64)
    out[0] = arr[:period].mean()
    for i in range(1, out.size):
        out[i] = alpha * arr[period - 1 + i] + (1 - alpha) * out[i - 1]
    return _round_list(out)


def _ema_array(arr: np.ndarray, period: int) -> np.ndarray:
    """Internal helper that returns an EMA ndarray for MACD composition."""
    if arr.size < period or period <= 0:
        return np.empty(0, dtype=np.float64)
    alpha = 2.0 / (period + 1)
    out = np.empty(arr.size - period + 1, dtype=np.float64)
    out[0] = arr[:period].mean()
    for i in range(1, out.size):
        out[i] = alpha * arr[period - 1 + i] + (1 - alpha) * out[i - 1]
    return out


# ---------------------------------------------------------------------------
# Momentum indicators
# ---------------------------------------------------------------------------

def rsi(prices: "list[float] | np.ndarray", period: int = 14) -> list[float]:
    """Wilder's Relative Strength Index.

    Vectorised: gains/losses are derived from a single ``np.diff`` call,
    then smoothed with Wilder's recursive formula
    ``avg_t = (avg_{t-1} * (P - 1) + value_t) / P``.
    """
    arr = _as_float_array(prices)
    if arr.size < period + 1:
        return []

    delta = np.diff(arr)
    gains = np.where(delta > 0, delta, 0.0)
    losses = np.where(delta < 0, -delta, 0.0)

    avg_gain = np.empty(delta.size, dtype=np.float64)
    avg_loss = np.empty(delta.size, dtype=np.float64)
    avg_gain[period - 1] = gains[:period].mean()
    avg_loss[period - 1] = losses[:period].mean()
    for i in range(period, delta.size):
        avg_gain[i] = (avg_gain[i - 1] * (period - 1) + gains[i]) / period
        avg_loss[i] = (avg_loss[i - 1] * (period - 1) + losses[i]) / period

    avg_gain = avg_gain[period - 1:]
    avg_loss = avg_loss[period - 1:]
    # Guard against divide-by-zero: if avg_loss is zero, RSI saturates at 100.
    with np.errstate(divide="ignore", invalid="ignore"):
        rs = np.where(avg_loss > 0, avg_gain / avg_loss, np.inf)
    out = 100.0 - (100.0 / (1.0 + rs))
    return _round_list(out)


def macd(
    prices: "list[float] | np.ndarray",
    fast: int = 12,
    slow: int = 26,
    signal_period: int = 9,
) -> dict:
    """Moving Average Convergence / Divergence.

    Returns the fast-EMA minus slow-EMA line, its signal EMA, and the
    histogram (``macd - signal``). Lines are aligned so all three output
    arrays share the same length.
    """
    arr = _as_float_array(prices)
    fast_ema = _ema_array(arr, fast)
    slow_ema = _ema_array(arr, slow)
    if fast_ema.size == 0 or slow_ema.size == 0:
        return {"macd": [], "signal": [], "histogram": []}

    # Align the two EMAs (fast-EMA has a shorter warm-up).
    offset = slow - fast
    macd_line = fast_ema[offset:] - slow_ema
    signal_line = _ema_array(macd_line, signal_period)
    if signal_line.size == 0:
        return {"macd": [], "signal": [], "histogram": []}

    sig_offset = macd_line.size - signal_line.size
    aligned_macd = macd_line[sig_offset:]
    histogram = aligned_macd - signal_line
    return {
        "macd": _round_list(aligned_macd),
        "signal": _round_list(signal_line),
        "histogram": _round_list(histogram),
    }


# ---------------------------------------------------------------------------
# Risk / trend indicators
# ---------------------------------------------------------------------------

def volatility(prices: "list[float] | np.ndarray", period: int = 0) -> float:
    """Population standard deviation of simple returns, as a percentage.

    When ``period`` is zero (the default) the entire series is used,
    otherwise the most recent ``period`` samples. Zero prices are skipped
    to avoid division-by-zero in the return computation.
    """
    arr = _as_float_array(prices)
    if arr.size < 2:
        return 0.0
    window = arr if period <= 0 else arr[-min(period + 1, arr.size):]
    prev = window[:-1]
    curr = window[1:]
    mask = prev != 0
    if not mask.any():
        return 0.0
    returns = (curr[mask] - prev[mask]) / prev[mask]
    return float(returns.std() * 100.0)


def detect_trend(prices: "list[float] | np.ndarray") -> str:
    """Classify trend from the slope of a least-squares fit.

    We normalise the slope by the mean price and by the series length so
    the threshold is scale-invariant. ±3% total drift over the window is
    the same boundary v1 used — kept for behavioural compatibility.
    """
    arr = _as_float_array(prices)
    if arr.size < 5:
        return "insufficient_data"
    x = np.arange(arr.size, dtype=np.float64)
    # np.polyfit degree-1 returns (slope, intercept).
    slope, _ = np.polyfit(x, arr, 1)
    avg = float(arr.mean())
    if avg == 0:
        return "sideways"
    normalized = (slope / avg) * 100.0 * arr.size
    if normalized > 3.0:
        return "uptrend"
    if normalized < -3.0:
        return "downtrend"
    return "sideways"


def support_resistance(
    highs: "list[float] | np.ndarray",
    lows: "list[float] | np.ndarray",
) -> dict:
    """Minimum low / maximum high over the last ``lookback`` bars (≤20)."""
    hi = _as_float_array(highs)
    lo = _as_float_array(lows)
    if hi.size == 0 or lo.size == 0:
        return {"support": None, "resistance": None}
    lookback = min(20, hi.size, lo.size)
    return {
        "support": round(float(lo[-lookback:].min()), 2),
        "resistance": round(float(hi[-lookback:].max()), 2),
    }


# ---------------------------------------------------------------------------
# Façade consumed by `/api/analysis/{symbol}`
# ---------------------------------------------------------------------------

def compute_all(history_data: dict) -> dict:
    """Compute the full indicator bundle from an OHLCV payload.

    The incoming payload is the JSON shape returned by ``/api/history`` —
    parallel arrays of dates, opens, highs, lows, closes, volumes.
    """
    closes = history_data.get("closes") or []
    if not closes:
        return {"error": "No price data available for analysis"}

    arr = _as_float_array(closes)
    rsi_values = rsi(arr, 14)

    result: dict = {
        "sma20": sma(arr, 20),
        "sma50": sma(arr, 50),
        "sma200": sma(arr, 200),
        "ema12": ema(arr, 12),
        "ema26": ema(arr, 26),
        "rsi": rsi_values,
        "currentRsi": rsi_values[-1] if rsi_values else None,
        "macd": macd(arr),
        "volatility": round(volatility(arr), 2),
        "trend": detect_trend(arr),
    }

    highs = history_data.get("highs") or []
    lows = history_data.get("lows") or []
    if highs and lows:
        result["supportResistance"] = support_resistance(highs, lows)

    if arr.size >= 2 and arr[0] != 0:
        result["periodReturn"] = round(float((arr[-1] - arr[0]) / arr[0] * 100), 2)

    return result

"""
Feature engineering pipeline for ML models.
Computes technical indicators from OHLCV data as model inputs.
"""

import numpy as np
import pandas as pd


def rsi(closes: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index."""
    delta = closes.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()
    # Switch to exponential smoothing after initial SMA
    for i in range(period, len(closes)):
        avg_gain.iloc[i] = (avg_gain.iloc[i - 1] * (period - 1) + gain.iloc[i]) / period
        avg_loss.iloc[i] = (avg_loss.iloc[i - 1] * (period - 1) + loss.iloc[i]) / period
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def macd(closes: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> tuple[pd.Series, pd.Series]:
    """MACD line and signal line."""
    ema_fast = closes.ewm(span=fast, adjust=False).mean()
    ema_slow = closes.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    return macd_line, signal_line


def bollinger_width(closes: pd.Series, period: int = 20, num_std: float = 2.0) -> pd.Series:
    """Bollinger Band width as percentage of middle band."""
    sma = closes.rolling(window=period).mean()
    std = closes.rolling(window=period).std()
    upper = sma + num_std * std
    lower = sma - num_std * std
    width = (upper - lower) / sma
    return width


def volume_zscore(volumes: pd.Series, period: int = 20) -> pd.Series:
    """Z-score of volume relative to rolling mean."""
    mean = volumes.rolling(window=period).mean()
    std = volumes.rolling(window=period).std()
    return (volumes - mean) / std.replace(0, np.nan)


def ma_crossover(closes: pd.Series, short: int = 10, long: int = 50) -> pd.Series:
    """Moving average crossover signal (short MA - long MA) / price."""
    ma_short = closes.rolling(window=short).mean()
    ma_long = closes.rolling(window=long).mean()
    return (ma_short - ma_long) / closes


def price_change_pct(closes: pd.Series, period: int = 1) -> pd.Series:
    """Percentage price change over N periods."""
    return closes.pct_change(periods=period) * 100


def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute all features from an OHLCV DataFrame.

    Input columns: open, high, low, close, volume
    Output: original columns + computed features, NaN rows dropped.
    """
    out = df.copy()
    out["rsi_14"] = rsi(out["close"], 14)
    out["macd_line"], out["macd_signal"] = macd(out["close"])
    out["macd_hist"] = out["macd_line"] - out["macd_signal"]
    out["bb_width"] = bollinger_width(out["close"], 20)
    out["vol_zscore"] = volume_zscore(out["volume"], 20)
    out["ma_cross_10_50"] = ma_crossover(out["close"], 10, 50)
    out["price_change_1d"] = price_change_pct(out["close"], 1)
    out["price_change_5d"] = price_change_pct(out["close"], 5)

    # Volatility: rolling 20-day standard deviation of returns
    out["volatility_20d"] = out["close"].pct_change().rolling(20).std() * np.sqrt(252) * 100

    return out.dropna()

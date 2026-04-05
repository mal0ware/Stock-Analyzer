"""
Trend Classifier — classifies price action into trend categories.

Uses a gradient boosted tree (sklearn's HistGradientBoostingClassifier as a
drop-in that doesn't require XGBoost to be installed, with an XGBoost upgrade
path).

Input: Rolling window of OHLCV features
Output: strong_uptrend | uptrend | sideways | downtrend | strong_downtrend
"""

import os
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

from .features import compute_features

MODEL_DIR = Path(__file__).parent / "models"
MODEL_PATH = MODEL_DIR / "trend_classifier.pkl"

LABELS = ["strong_downtrend", "downtrend", "sideways", "uptrend", "strong_uptrend"]

FEATURE_COLS = [
    "rsi_14",
    "macd_hist",
    "bb_width",
    "vol_zscore",
    "ma_cross_10_50",
    "price_change_1d",
    "price_change_5d",
    "volatility_20d",
]


def _label_trend(future_return: float) -> int:
    """Assign a trend label based on forward N-day return."""
    if future_return > 5.0:
        return 4  # strong_uptrend
    elif future_return > 1.5:
        return 3  # uptrend
    elif future_return < -5.0:
        return 0  # strong_downtrend
    elif future_return < -1.5:
        return 1  # downtrend
    else:
        return 2  # sideways


def prepare_training_data(symbols: list[str], period: str = "2y") -> tuple[pd.DataFrame, pd.Series]:
    """
    Build training dataset from historical data for multiple symbols.
    Returns (X features, y labels).
    """
    import yfinance as yf

    all_X = []
    all_y = []

    for sym in symbols:
        try:
            ticker = yf.Ticker(sym)
            hist = ticker.history(period=period, interval="1d")
            if hist.empty or len(hist) < 60:
                continue

            df = hist.rename(columns={
                "Open": "open", "High": "high", "Low": "low",
                "Close": "close", "Volume": "volume",
            })
            df = compute_features(df)

            # Forward 10-day return as the label target
            df["future_return"] = df["close"].shift(-10) / df["close"] * 100 - 100
            df = df.dropna()

            if df.empty:
                continue

            X = df[FEATURE_COLS]
            y = df["future_return"].apply(_label_trend)
            all_X.append(X)
            all_y.append(y)
        except Exception:
            continue

    if not all_X:
        raise ValueError("No training data could be collected")

    return pd.concat(all_X, ignore_index=True), pd.concat(all_y, ignore_index=True)


def train(symbols: list[str] | None = None) -> dict:
    """
    Train the trend classifier and save to disk.
    Returns training metrics.
    """
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score, classification_report

    if symbols is None:
        # Default training universe — liquid large-caps
        symbols = [
            "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "JPM",
            "V", "WMT", "JNJ", "PG", "XOM", "UNH", "HD", "BAC", "DIS",
            "NFLX", "AMD", "CRM", "INTC", "CSCO", "PFE", "KO", "PEP",
        ]

    X, y = prepare_training_data(symbols)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y,
    )

    model = HistGradientBoostingClassifier(
        max_iter=200,
        max_depth=6,
        learning_rate=0.1,
        random_state=42,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    report = classification_report(y_test, y_pred, target_names=LABELS, output_dict=True)

    # Save model
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model, f)

    return {"accuracy": round(accuracy, 4), "report": report, "samples": len(X)}


class TrendClassifier:
    """Loads a pre-trained model and classifies current market conditions."""

    def __init__(self):
        self._model = None

    def _load(self):
        if self._model is None:
            if MODEL_PATH.exists():
                with open(MODEL_PATH, "rb") as f:
                    self._model = pickle.load(f)
            else:
                return False
        return True

    def predict(self, df: pd.DataFrame) -> dict:
        """
        Predict trend from an OHLCV DataFrame.
        Returns {"trend": str, "trend_confidence": float, "probabilities": dict}.
        Falls back to rule-based analysis if model not trained yet.
        """
        features = compute_features(df)
        if features.empty:
            return {"trend": "insufficient_data", "trend_confidence": 0.0, "probabilities": {}}

        if not self._load():
            return self._rule_based_fallback(features)

        row = features[FEATURE_COLS].iloc[-1:].values
        proba = self._model.predict_proba(row)[0]
        pred_idx = int(np.argmax(proba))

        return {
            "trend": LABELS[pred_idx],
            "trend_confidence": round(float(proba[pred_idx]), 3),
            "probabilities": {LABELS[i]: round(float(p), 3) for i, p in enumerate(proba)},
        }

    def _rule_based_fallback(self, features: pd.DataFrame) -> dict:
        """Simple rule-based trend detection when model isn't trained."""
        row = features.iloc[-1]
        rsi = row.get("rsi_14", 50)
        macd_h = row.get("macd_hist", 0)
        ma_cross = row.get("ma_cross_10_50", 0)
        price_5d = row.get("price_change_5d", 0)

        score = 0
        if rsi > 60:
            score += 1
        elif rsi < 40:
            score -= 1
        if macd_h > 0:
            score += 1
        elif macd_h < 0:
            score -= 1
        if ma_cross > 0:
            score += 1
        elif ma_cross < 0:
            score -= 1
        if price_5d > 2:
            score += 1
        elif price_5d < -2:
            score -= 1

        if score >= 3:
            trend, conf = "strong_uptrend", 0.75
        elif score >= 1:
            trend, conf = "uptrend", 0.60
        elif score <= -3:
            trend, conf = "strong_downtrend", 0.75
        elif score <= -1:
            trend, conf = "downtrend", 0.60
        else:
            trend, conf = "sideways", 0.55

        return {"trend": trend, "trend_confidence": conf, "probabilities": {}, "method": "rule_based"}


# Module-level singleton
classifier = TrendClassifier()

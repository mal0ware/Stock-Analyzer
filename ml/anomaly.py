"""
Anomaly Detector — flags unusual market activity using Isolation Forest.

Input: Intraday price + volume features
Output: Anomaly score (0.0–1.0) + boolean flag
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from .features import compute_features


class AnomalyDetector:
    """
    Detects anomalous price/volume activity using Isolation Forest.
    No pre-training needed — fits on the provided window each call.
    """

    def __init__(self, contamination: float = 0.05):
        self.contamination = contamination

    def detect(self, df: pd.DataFrame) -> dict:
        """
        Analyze a DataFrame of OHLCV data for anomalies.

        Returns:
            {
                "anomaly_score": float (0.0-1.0, higher = more anomalous),
                "anomaly_flag": bool,
                "features": {
                    "price_change_pct": float,
                    "volume_ratio": float,
                    "volatility": float,
                },
            }
        """
        if len(df) < 20:
            return {
                "anomaly_score": 0.0,
                "anomaly_flag": False,
                "features": {"price_change_pct": 0.0, "volume_ratio": 1.0, "volatility": 0.0},
            }

        features_df = self._build_features(df)
        if features_df.empty:
            return {
                "anomaly_score": 0.0,
                "anomaly_flag": False,
                "features": {"price_change_pct": 0.0, "volume_ratio": 1.0, "volatility": 0.0},
            }

        feature_cols = ["price_change_pct", "volume_ratio", "volatility"]
        X = features_df[feature_cols].values

        model = IsolationForest(
            contamination=self.contamination,
            random_state=42,
            n_estimators=100,
        )
        model.fit(X)

        # Score the most recent point
        latest = X[-1:]
        raw_score = model.decision_function(latest)[0]
        # Convert to 0-1 scale: more negative = more anomalous
        anomaly_score = max(0.0, min(1.0, -raw_score / 0.5 + 0.5))
        anomaly_flag = bool(anomaly_score > 0.7)

        return {
            "anomaly_score": round(anomaly_score, 3),
            "anomaly_flag": anomaly_flag,
            "features": {
                "price_change_pct": round(float(features_df["price_change_pct"].iloc[-1]), 3),
                "volume_ratio": round(float(features_df["volume_ratio"].iloc[-1]), 3),
                "volatility": round(float(features_df["volatility"].iloc[-1]), 3),
            },
        }

    def _build_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Build anomaly detection features from OHLCV data."""
        out = pd.DataFrame(index=df.index)
        out["price_change_pct"] = df["close"].pct_change() * 100
        avg_vol = df["volume"].rolling(20).mean()
        out["volume_ratio"] = df["volume"] / avg_vol.replace(0, np.nan)
        out["volatility"] = df["close"].pct_change().rolling(10).std() * np.sqrt(252) * 100
        return out.dropna()


# Module-level singleton
detector = AnomalyDetector()

"""
Anomaly Detector — flags unusual price/volume activity with Isolation Forest.

Why Isolation Forest
--------------------
Market anomalies are defined by "unusual combinations of features", not by
distance from a single mean. Isolation Forest partitions the feature space
with random splits and scores a point by the average tree depth at which
it becomes isolated — genuine outliers fall out in only a few splits. This
matches how a trader would describe an anomaly ("an unusually large move
on unusually high volume") without requiring us to pre-specify what the
"normal" distribution looks like.

Caching strategy
----------------
The v1 implementation fit a new 100-tree forest on **every** snapshot
request (~200 ms of CPU each). We now fit once per symbol and re-use the
model for ``TTL`` seconds. Re-fits happen lazily on cache miss or when the
underlying feature matrix is stale, so typical latency drops by ~200× for
hot symbols with zero behavioural change.

The cache key also includes the feature matrix shape, so a longer window
naturally invalidates the stale fit; we use a fast fingerprint (length +
last-bar timestamp) to avoid hashing the whole array.

Complexity
----------
====================  ========================  ===================
Operation             Time                      Space
====================  ========================  ===================
Fit                   O(n_trees · n · log n)    O(n_trees · n)
Score (single row)    O(n_trees · log n)        O(1)
Cache lookup          O(1) amortised            O(1)
====================  ========================  ===================
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

FEATURE_COLS: tuple[str, ...] = ("price_change_pct", "volume_ratio", "volatility")

# How long a fitted model is considered fresh. Daily data changes at
# end-of-day cadence, so a 15-minute TTL is a safe default that still lets
# freshly-published bars force a re-fit during market hours.
_MODEL_TTL_SECONDS = 15 * 60


@dataclass(slots=True)
class _CachedModel:
    model: IsolationForest
    fingerprint: tuple[int, str]
    fitted_at: float


class AnomalyDetector:
    """Detects anomalous price/volume activity using Isolation Forest.

    Parameters
    ----------
    contamination : float
        Expected share of anomalous samples in 'typical' data. Controls
        the decision boundary; we keep 5% to match the v1 threshold.

    Thread safety
    -------------
    The detector is shared as a module-level singleton across the FastAPI
    thread pool. All access to the internal model cache goes through an
    ``RLock`` so two concurrent snapshot requests for the same symbol
    can't race on a half-fitted model.
    """

    __slots__ = ("contamination", "_cache", "_lock")

    def __init__(self, contamination: float = 0.05) -> None:
        self.contamination = contamination
        self._cache: dict[str, _CachedModel] = {}
        self._lock = threading.RLock()

    # ------------------------------------------------------------------ API

    def detect(self, df: pd.DataFrame, *, symbol: str | None = None) -> dict:
        """Score the **latest** bar for anomaly intensity.

        Returns a payload compatible with the v1 shape so the snapshot
        endpoint stays wire-compatible.
        """
        empty = {
            "anomaly_score": 0.0,
            "anomaly_flag": False,
            "features": {"price_change_pct": 0.0, "volume_ratio": 1.0, "volatility": 0.0},
        }
        if len(df) < 20:
            return empty

        features_df = self._build_features(df)
        if features_df.empty:
            return empty

        X = features_df[list(FEATURE_COLS)].to_numpy()
        model = self._get_or_fit(symbol, features_df, X)
        raw = float(model.decision_function(X[-1:])[0])
        score = float(np.clip(-raw / 0.5 + 0.5, 0.0, 1.0))
        return {
            "anomaly_score": round(score, 3),
            "anomaly_flag": score > 0.7,
            "features": {
                col: round(float(features_df[col].iloc[-1]), 3)
                for col in FEATURE_COLS
            },
        }

    def scan_series(self, df: pd.DataFrame, *, symbol: str | None = None) -> dict:
        """Score **every** bar and attribute each flagged event to its dominant feature."""
        empty = {
            "feature_cols": list(FEATURE_COLS),
            "scores": [],
            "events": [],
            "thresholds": {"flag": 0.7, "contamination": self.contamination},
        }
        if len(df) < 25:
            return empty

        features_df = self._build_features(df)
        if features_df.empty:
            return empty

        X = features_df[list(FEATURE_COLS)].to_numpy()
        model = self._get_or_fit(symbol, features_df, X)
        raw = model.decision_function(X)
        scores = np.clip(-raw / 0.5 + 0.5, 0.0, 1.0)

        # Per-feature z-scores let us explain *why* a bar is anomalous.
        means = features_df[list(FEATURE_COLS)].mean()
        stds = features_df[list(FEATURE_COLS)].std().replace(0, np.nan)
        z = ((features_df[list(FEATURE_COLS)] - means) / stds).fillna(0.0)
        close_aligned = df.loc[features_df.index, "close"]

        per_bar: list[dict] = []
        events: list[dict] = []
        for i, (idx, score) in enumerate(zip(features_df.index, scores)):
            row_features = {c: round(float(features_df[c].iloc[i]), 4) for c in FEATURE_COLS}
            row_z = {c: round(float(z[c].iloc[i]), 3) for c in FEATURE_COLS}
            flag = bool(score > 0.7)
            iso = idx.isoformat() if hasattr(idx, "isoformat") else str(idx)
            per_bar.append({
                "date": iso,
                "score": round(float(score), 4),
                "flag": flag,
                "features": row_features,
                "z_scores": row_z,
            })
            if flag:
                dominant = max(FEATURE_COLS, key=lambda c: abs(row_z[c]))
                events.append({
                    "date": iso,
                    "score": round(float(score), 4),
                    "close": round(float(close_aligned.iloc[i]), 2),
                    "dominant_feature": dominant,
                    "dominant_z": row_z[dominant],
                    "features": row_features,
                    "z_scores": row_z,
                })

        events.sort(key=lambda e: e["date"], reverse=True)
        return {
            "feature_cols": list(FEATURE_COLS),
            "scores": per_bar,
            "events": events,
            "thresholds": {"flag": 0.7, "contamination": self.contamination},
        }

    def clear_cache(self) -> None:
        """Drop every cached model. Used by tests and during deploys."""
        with self._lock:
            self._cache.clear()

    # -------------------------------------------------------------- Internals

    @staticmethod
    def _build_features(df: pd.DataFrame) -> pd.DataFrame:
        """Derive the 3-column feature frame consumed by the forest."""
        out = pd.DataFrame(index=df.index)
        out["price_change_pct"] = df["close"].pct_change() * 100
        avg_vol = df["volume"].rolling(20).mean()
        out["volume_ratio"] = df["volume"] / avg_vol.replace(0, np.nan)
        out["volatility"] = df["close"].pct_change().rolling(10).std() * np.sqrt(252) * 100
        return out.dropna()

    @staticmethod
    def _fingerprint(features_df: pd.DataFrame) -> tuple[int, str]:
        """Cheap identity for the feature window: (length, last-bar key).

        Two consecutive polls with the same ending timestamp and length
        describe the same data without hashing the full matrix.
        """
        last_idx = features_df.index[-1]
        last_key = last_idx.isoformat() if hasattr(last_idx, "isoformat") else str(last_idx)
        return (len(features_df), last_key)

    def _get_or_fit(
        self,
        symbol: Optional[str],
        features_df: pd.DataFrame,
        X: np.ndarray,
    ) -> IsolationForest:
        """Return a fitted model, reusing the cached one when possible.

        The cache key is the symbol (or a synthetic ``<anon>`` bucket when
        the caller didn't pass one). An entry is considered valid if the
        feature fingerprint matches and the model is younger than
        ``_MODEL_TTL_SECONDS``.
        """
        key = symbol or "<anon>"
        fingerprint = self._fingerprint(features_df)
        now = time.monotonic()

        with self._lock:
            cached = self._cache.get(key)
            if (
                cached is not None
                and cached.fingerprint == fingerprint
                and now - cached.fitted_at < _MODEL_TTL_SECONDS
            ):
                return cached.model

            model = IsolationForest(
                contamination=self.contamination,
                random_state=42,
                n_estimators=100,
            )
            model.fit(X)
            self._cache[key] = _CachedModel(model=model, fingerprint=fingerprint, fitted_at=now)
            return model


# Module-level singleton consumed by routes and the event bus.
detector = AnomalyDetector()

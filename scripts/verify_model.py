#!/usr/bin/env python3
"""
Release-gate check: the committed trend-classifier artifact must exist,
unpickle, and actually drive predictions (method == "ml_model").

Run from the repository root with any interpreter that has the api
requirements installed — in the desktop release workflow this is executed
with the *bundled* python-env, so it validates exactly what ships:

    python scripts/verify_model.py

Exits non-zero (with a readable reason) if the model is missing or the
classifier silently falls back to the rule-based heuristic. This is the
guard that keeps releases from ever shipping without the trained model
again.
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))


def main() -> int:
    import numpy as np
    import pandas as pd

    from ml.trend import METRICS_PATH, MODEL_PATH, TrendClassifier

    if not MODEL_PATH.exists():
        print(f"FAIL: trained model missing at {MODEL_PATH} — "
              "run `python -m ml.train_cli` and commit the artifact "
              "(see ml/TRAINING.md).", file=sys.stderr)
        return 1
    if not METRICS_PATH.exists():
        print(f"FAIL: metrics missing at {METRICS_PATH} — training writes it "
              "next to the model; commit both.", file=sys.stderr)
        return 1

    # Deterministic synthetic OHLCV, long enough for every feature window.
    rng = np.random.default_rng(42)
    n = 160
    close = 100.0 + np.cumsum(rng.normal(0.05, 1.0, n))
    high = close + rng.uniform(0.1, 1.5, n)
    low = close - rng.uniform(0.1, 1.5, n)
    df = pd.DataFrame({
        "open": close + rng.normal(0, 0.5, n),
        "high": high,
        "low": low,
        "close": close,
        "volume": rng.integers(1_000_000, 5_000_000, n).astype(float),
    })

    result = TrendClassifier().predict(df)
    if result.get("method") != "ml_model":
        print(f"FAIL: classifier did not use the trained model: {result}",
              file=sys.stderr)
        return 1
    if result.get("trend") not in {
        "strong_downtrend", "downtrend", "sideways", "uptrend", "strong_uptrend",
    }:
        print(f"FAIL: unexpected prediction payload: {result}", file=sys.stderr)
        return 1

    probs = result.get("probabilities", {})
    total = sum(probs.values())
    if not 0.98 <= total <= 1.02:
        print(f"FAIL: class probabilities do not sum to 1 ({total}): {probs}",
              file=sys.stderr)
        return 1

    size_mb = MODEL_PATH.stat().st_size / 1_048_576
    print(f"OK: {MODEL_PATH.name} ({size_mb:.1f} MB) loads and predicts "
          f"'{result['trend']}' (confidence {result['trend_confidence']}) "
          "via method=ml_model")
    return 0


if __name__ == "__main__":
    sys.exit(main())

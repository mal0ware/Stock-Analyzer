"""
Benchmark assertion tests.

Verifies that:
1. Prediction latency stays under threshold.
2. Model accuracy (if metrics.json exists) stays above baseline.
"""

import json
import sys
import os
import time

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ml.gradient_boosting import GradientBoostingClassifier


def test_prediction_latency():
    """Single-sample prediction should complete under 50ms."""
    np.random.seed(42)
    X_train = np.random.randn(200, 8)
    y_train = np.random.randint(0, 5, 200)

    model = GradientBoostingClassifier(n_estimators=50, max_depth=4, learning_rate=0.1)
    model.fit(X_train, y_train)

    # Warmup
    model.predict(X_train[:1])

    # Measure single-sample prediction
    latencies = []
    for i in range(100):
        sample = X_train[i % len(X_train):i % len(X_train) + 1]
        start = time.perf_counter()
        model.predict(sample)
        latencies.append(time.perf_counter() - start)

    p95_ms = np.percentile(latencies, 95) * 1000
    assert p95_ms < 50, f"p95 prediction latency {p95_ms:.1f}ms exceeds 50ms threshold"


def test_metrics_accuracy_threshold():
    """If metrics.json exists, accuracy should be above baseline (0.30 for 5-class)."""
    metrics_path = os.path.join(os.path.dirname(__file__), "..", "ml", "models", "metrics.json")

    if not os.path.exists(metrics_path):
        pytest.skip("No metrics.json found — model not yet trained")

    with open(metrics_path) as f:
        metrics = json.load(f)

    accuracy = metrics.get("accuracy", 0)
    assert accuracy > 0.30, (
        f"Model accuracy {accuracy:.3f} is below the 0.30 threshold for a 5-class problem "
        f"(random baseline is 0.20)"
    )

    # Also check that feature importances are present and valid
    gain = metrics.get("feature_importances_gain", {})
    assert len(gain) > 0, "No feature importances in metrics.json"
    assert abs(sum(gain.values()) - 1.0) < 0.05, f"Feature importances sum to {sum(gain.values())}"

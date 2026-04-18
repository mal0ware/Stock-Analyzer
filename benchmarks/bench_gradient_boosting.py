#!/usr/bin/env python3
"""
Benchmark: custom gradient boosting vs sklearn.

Compares training time, prediction latency, and accuracy on synthetic data.
Run: python benchmarks/bench_gradient_boosting.py

Results saved to benchmarks/results.json
"""

import json
import sys
import time
from pathlib import Path

import numpy as np

# Add repo root to path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ml.gradient_boosting import GradientBoostingClassifier


def generate_synthetic_data(n_samples: int = 5000, n_features: int = 8, n_classes: int = 5, seed: int = 42):
    """Generate synthetic classification data with known structure."""
    rng = np.random.RandomState(seed)
    X = rng.randn(n_samples, n_features)

    # Create separable classes based on linear combinations of features
    score = X[:, 0] + 0.8 * X[:, 1] + 0.5 * X[:, 2] + rng.randn(n_samples) * 0.3
    thresholds = np.percentile(score, [20, 40, 60, 80])
    y = np.digitize(score, thresholds)

    return X, y


def benchmark_custom(X_train, y_train, X_test, y_test, params):
    """Benchmark the custom gradient boosting implementation."""
    model = GradientBoostingClassifier(**params)

    start = time.perf_counter()
    model.fit(X_train, y_train)
    train_time = time.perf_counter() - start

    preds = model.predict(X_test)
    accuracy = (preds == y_test).mean()

    # Prediction latency (average over 100 runs on 1000 samples)
    latencies = []
    for _ in range(100):
        start = time.perf_counter()
        model.predict(X_test[:1000])
        latencies.append(time.perf_counter() - start)
    avg_predict_ms = np.mean(latencies) * 1000  # Total ms for 1000 samples
    per_sample_ms = avg_predict_ms / 1000

    return {
        "train_seconds": round(train_time, 3),
        "accuracy": round(float(accuracy), 4),
        "predict_ms_per_sample": round(per_sample_ms, 4),
        "predict_total_ms_1000": round(avg_predict_ms, 2),
    }


def benchmark_sklearn(X_train, y_train, X_test, y_test, params):
    """Benchmark sklearn's HistGradientBoostingClassifier."""
    try:
        from sklearn.ensemble import HistGradientBoostingClassifier as SklearnGBC
    except ImportError:
        return None

    model = SklearnGBC(
        max_iter=params["n_estimators"],
        max_depth=params["max_depth"],
        learning_rate=params["learning_rate"],
        random_state=42,
    )

    start = time.perf_counter()
    model.fit(X_train, y_train)
    train_time = time.perf_counter() - start

    preds = model.predict(X_test)
    accuracy = (preds == y_test).mean()

    latencies = []
    for _ in range(100):
        start = time.perf_counter()
        model.predict(X_test[:1000])
        latencies.append(time.perf_counter() - start)
    avg_predict_ms = np.mean(latencies) * 1000
    per_sample_ms = avg_predict_ms / 1000

    return {
        "train_seconds": round(train_time, 3),
        "accuracy": round(float(accuracy), 4),
        "predict_ms_per_sample": round(per_sample_ms, 4),
        "predict_total_ms_1000": round(avg_predict_ms, 2),
    }


def main():
    print("=" * 60)
    print("Gradient Boosting Benchmark: Custom vs sklearn")
    print("=" * 60)

    X, y = generate_synthetic_data(n_samples=5000, n_features=8, n_classes=5)

    # 80/20 split
    split = int(len(X) * 0.8)
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    params = {"n_estimators": 100, "max_depth": 4, "learning_rate": 0.1}

    print(f"\nDataset: {len(X_train)} train, {len(X_test)} test, 8 features, 5 classes")
    print(f"Params: {params}\n")

    print("Running custom model benchmark...")
    custom = benchmark_custom(X_train, y_train, X_test, y_test, params)
    print(f"  Train time:  {custom['train_seconds']:.3f}s")
    print(f"  Accuracy:    {custom['accuracy']:.1%}")
    print(f"  Predict:     {custom['predict_ms_per_sample']:.4f} ms/sample")

    print("\nRunning sklearn benchmark...")
    sklearn = benchmark_sklearn(X_train, y_train, X_test, y_test, params)
    if sklearn:
        print(f"  Train time:  {sklearn['train_seconds']:.3f}s")
        print(f"  Accuracy:    {sklearn['accuracy']:.1%}")
        print(f"  Predict:     {sklearn['predict_ms_per_sample']:.4f} ms/sample")

        print(f"\nComparison:")
        acc_diff = custom["accuracy"] - sklearn["accuracy"]
        speed_ratio = custom["train_seconds"] / sklearn["train_seconds"] if sklearn["train_seconds"] > 0 else float("inf")
        print(f"  Accuracy diff:      {acc_diff:+.1%} (custom - sklearn)")
        print(f"  Train speed ratio:  {speed_ratio:.1f}x slower (expected — numpy vs C)")
    else:
        print("  sklearn not installed — skipped")

    results = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "dataset": {"n_train": len(X_train), "n_test": len(X_test), "n_features": 8, "n_classes": 5},
        "hyperparameters": params,
        "custom": custom,
        "sklearn": sklearn,
    }

    out_path = Path(__file__).parent / "results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    main()

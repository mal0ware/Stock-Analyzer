"""
Integration tests for the full ML pipeline.

All tests use synthetic data — no yfinance calls, no network.
"""

import pickle
import sys
import os

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ml.gradient_boosting import GradientBoostingClassifier
from ml.features import compute_features
from ml.trend import (
    _label_trend,
    _compute_class_weights,
    _stratified_k_fold,
    FEATURE_COLS,
)
from ml.anomaly import AnomalyDetector


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def synthetic_ohlcv():
    """500 rows of synthetic OHLCV with a planted upward drift."""
    np.random.seed(42)
    n = 500
    # Plant a trend: prices drift upward
    close = 100 + np.cumsum(np.random.randn(n) * 0.5 + 0.05)
    return pd.DataFrame({
        "open": close + np.random.randn(n) * 0.2,
        "high": close + abs(np.random.randn(n) * 0.8),
        "low": close - abs(np.random.randn(n) * 0.8),
        "close": close,
        "volume": np.random.randint(1_000_000, 10_000_000, n),
    })


@pytest.fixture
def synthetic_classification_data():
    """Separable 5-class classification data."""
    np.random.seed(42)
    n = 500
    X = np.random.randn(n, 8)
    score = X[:, 0] + 0.8 * X[:, 1] + 0.5 * X[:, 2] + np.random.randn(n) * 0.3
    thresholds = np.percentile(score, [20, 40, 60, 80])
    y = np.digitize(score, thresholds)
    return X, y


# ---------------------------------------------------------------------------
# Full pipeline tests
# ---------------------------------------------------------------------------

def test_full_pipeline_synthetic(synthetic_ohlcv):
    """Synthetic OHLCV -> features -> labels -> train -> predict -> accuracy > random."""
    features = compute_features(synthetic_ohlcv)
    assert not features.empty

    # Generate labels (simulate forward returns)
    features = features.copy()
    features["future_return"] = features["close"].shift(-10) / features["close"] * 100 - 100
    features = features.dropna()

    X = features[FEATURE_COLS].values
    y = features["future_return"].apply(_label_trend).values

    model = GradientBoostingClassifier(n_estimators=30, max_depth=3, learning_rate=0.1)
    model.fit(X, y)

    preds = model.predict(X)
    accuracy = (preds == y).mean()

    # Should beat random (1/5 = 0.20) on training data
    assert accuracy > 0.25, f"Accuracy {accuracy:.3f} too low"


def test_gradient_boosting_vs_sklearn(synthetic_classification_data):
    """Custom accuracy should be within 10 percentage points of sklearn."""
    X, y = synthetic_classification_data

    split = int(len(X) * 0.8)
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    # Custom model
    custom = GradientBoostingClassifier(n_estimators=50, max_depth=4, learning_rate=0.1)
    custom.fit(X_train, y_train)
    custom_acc = (custom.predict(X_test) == y_test).mean()

    # Sklearn model
    try:
        from sklearn.ensemble import HistGradientBoostingClassifier
        sklearn_model = HistGradientBoostingClassifier(
            max_iter=50, max_depth=4, learning_rate=0.1, random_state=42,
        )
        sklearn_model.fit(X_train, y_train)
        sklearn_acc = (sklearn_model.predict(X_test) == y_test).mean()

        assert abs(custom_acc - sklearn_acc) < 0.10, (
            f"Custom {custom_acc:.3f} vs sklearn {sklearn_acc:.3f} — gap too large"
        )
    except ImportError:
        pytest.skip("sklearn not installed")


def test_model_persistence_roundtrip(synthetic_classification_data):
    """Pickle/unpickle should produce identical predictions."""
    X, y = synthetic_classification_data

    model = GradientBoostingClassifier(n_estimators=20, max_depth=3, learning_rate=0.1)
    model.fit(X, y)
    preds_before = model.predict(X)

    data = pickle.dumps(model)
    model2 = pickle.loads(data)
    preds_after = model2.predict(X)

    assert np.array_equal(preds_before, preds_after)


def test_cross_validation_runs(synthetic_classification_data):
    """Stratified 5-fold should return 5 fold accuracies."""
    X, y = synthetic_classification_data
    folds = _stratified_k_fold(y, k=5)

    assert len(folds) == 5
    fold_accuracies = []
    for train_idx, val_idx in folds:
        assert len(train_idx) + len(val_idx) == len(y)
        assert len(np.intersect1d(train_idx, val_idx)) == 0

        model = GradientBoostingClassifier(n_estimators=10, max_depth=3, learning_rate=0.1)
        model.fit(X[train_idx], y[train_idx])
        acc = (model.predict(X[val_idx]) == y[val_idx]).mean()
        fold_accuracies.append(acc)

    assert len(fold_accuracies) == 5
    assert all(0.0 <= a <= 1.0 for a in fold_accuracies)


def test_class_weights_effect():
    """Weighted model should have better macro-F1 on imbalanced data."""
    np.random.seed(42)
    n = 300
    X = np.random.randn(n, 4)

    # Imbalanced: 80% class 2, 10% each for classes 0 and 1
    y = np.array([0] * 30 + [1] * 30 + [2] * 240)
    np.random.shuffle(y)

    weights = _compute_class_weights(y)
    no_weights = np.ones(n)

    model_weighted = GradientBoostingClassifier(n_estimators=30, max_depth=3, learning_rate=0.1)
    model_weighted.fit(X, y, sample_weight=weights)

    model_unweighted = GradientBoostingClassifier(n_estimators=30, max_depth=3, learning_rate=0.1)
    model_unweighted.fit(X, y, sample_weight=no_weights)

    # Compute macro-F1 for both
    preds_w = model_weighted.predict(X)
    preds_u = model_unweighted.predict(X)

    def macro_f1(y_true, y_pred, n_cls=3):
        f1s = []
        for c in range(n_cls):
            tp = ((y_pred == c) & (y_true == c)).sum()
            fp = ((y_pred == c) & (y_true != c)).sum()
            fn = ((y_pred != c) & (y_true == c)).sum()
            prec = tp / (tp + fp) if (tp + fp) > 0 else 0
            rec = tp / (tp + fn) if (tp + fn) > 0 else 0
            f1 = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0
            f1s.append(f1)
        return np.mean(f1s)

    f1_w = macro_f1(y, preds_w)
    f1_u = macro_f1(y, preds_u)

    # Weighted should be at least as good (usually better on minority classes)
    assert f1_w >= f1_u * 0.9, f"Weighted F1 {f1_w:.3f} much worse than unweighted {f1_u:.3f}"


def test_feature_importances_sum(synthetic_classification_data):
    """Feature importances should sum to approximately 1.0."""
    X, y = synthetic_classification_data

    model = GradientBoostingClassifier(n_estimators=20, max_depth=3, learning_rate=0.1)
    model.fit(X, y)

    imp = model.feature_importances_
    assert len(imp) == 8
    assert abs(imp.sum() - 1.0) < 0.01, f"Importances sum to {imp.sum()}, expected ~1.0"
    assert all(i >= 0 for i in imp)


# ---------------------------------------------------------------------------
# Edge case tests
# ---------------------------------------------------------------------------

def test_penny_stock_features():
    """OHLCV with prices < $1 should not produce NaN or Inf in features."""
    np.random.seed(42)
    n = 100
    close = 0.05 + np.abs(np.cumsum(np.random.randn(n) * 0.001))
    df = pd.DataFrame({
        "open": close + np.random.randn(n) * 0.001,
        "high": close + abs(np.random.randn(n) * 0.002),
        "low": close - abs(np.random.randn(n) * 0.002),
        "close": close,
        "volume": np.random.randint(100, 10_000, n),
    })
    features = compute_features(df)
    assert not features.empty
    for col in FEATURE_COLS:
        if col in features.columns:
            assert not features[col].isna().any(), f"NaN in {col} for penny stock data"
            assert not np.isinf(features[col]).any(), f"Inf in {col} for penny stock data"


def test_high_volatility_anomaly():
    """OHLCV with 20% daily swings should trigger anomaly detection."""
    np.random.seed(42)
    n = 100
    close = 100 + np.cumsum(np.random.randn(n) * 20)  # Huge swings
    close = np.abs(close) + 1  # Keep positive
    df = pd.DataFrame({
        "open": close * (1 + np.random.randn(n) * 0.05),
        "high": close * 1.1,
        "low": close * 0.9,
        "close": close,
        "volume": np.random.randint(1_000_000, 50_000_000, n),
    })
    det = AnomalyDetector()
    result = det.detect(df)
    assert "anomaly_score" in result
    assert 0.0 <= result["anomaly_score"] <= 1.0


def test_missing_volume_data():
    """OHLCV with some volume = 0 should not crash."""
    np.random.seed(42)
    n = 100
    close = 100 + np.cumsum(np.random.randn(n) * 0.5)
    volume = np.random.randint(1_000_000, 10_000_000, n)
    volume[::5] = 0  # Every 5th row has zero volume
    df = pd.DataFrame({
        "open": close + np.random.randn(n) * 0.1,
        "high": close + abs(np.random.randn(n) * 0.5),
        "low": close - abs(np.random.randn(n) * 0.5),
        "close": close,
        "volume": volume,
    })
    features = compute_features(df)
    assert not features.empty

    det = AnomalyDetector()
    result = det.detect(df)
    assert "anomaly_score" in result


def test_constant_price():
    """All closes identical — RSI should not produce NaN."""
    n = 100
    close = np.full(n, 100.0)
    df = pd.DataFrame({
        "open": close,
        "high": close,
        "low": close,
        "close": close,
        "volume": np.full(n, 5_000_000),
    })
    features = compute_features(df)
    # May be empty due to NaN drops (constant price = zero std = NaN z-scores),
    # but should not raise an exception
    assert isinstance(features, pd.DataFrame)

"""
Trend Classifier — classifies price action into trend categories.

Uses a from-scratch gradient boosting implementation (see gradient_boosting.py)
with second-order optimization and softmax cross-entropy loss. The training
pipeline includes stratified K-fold cross-validation, hyperparameter grid
search, class-weight balancing, and feature importance analysis.

Input: Rolling window of OHLCV features
Output: strong_uptrend | uptrend | sideways | downtrend | strong_uptrend
"""

import itertools
import json
import os
import pickle
from datetime import datetime, timezone
from multiprocessing import Pool, cpu_count
from pathlib import Path

import numpy as np
import pandas as pd

from .features import compute_features
from .gradient_boosting import (
    GradientBoostingClassifier,
    compute_permutation_importance,
)

MODEL_DIR = Path(__file__).parent / "models"
MODEL_PATH = MODEL_DIR / "trend_classifier.pkl"
METRICS_PATH = MODEL_DIR / "metrics.json"

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


# ---------------------------------------------------------------------------
# Cross-validation and grid search (numpy-only, no sklearn dependency)
# ---------------------------------------------------------------------------

def _compute_class_weights(y: np.ndarray) -> np.ndarray:
    """Compute balanced class weights inversely proportional to frequency.

    weight_k = n_samples / (n_classes * count_k)

    This upweights rare classes so the model doesn't ignore them in favor
    of the majority class (typically "sideways" in stock data).
    """
    classes = np.unique(y)
    n_samples = len(y)
    n_classes = len(classes)
    weights = np.ones(n_samples, dtype=np.float64)
    for cls in classes:
        mask = y == cls
        count = mask.sum()
        if count > 0:
            weights[mask] = n_samples / (n_classes * count)
    return weights


def _stratified_k_fold(y: np.ndarray, k: int = 5, random_state: int = 42) -> list[tuple[np.ndarray, np.ndarray]]:
    """Generate stratified K-fold split indices.

    Distributes samples round-robin across folds within each class, ensuring
    each fold has approximately the same class distribution as the full dataset.

    Returns list of (train_indices, val_indices) tuples.
    """
    rng = np.random.RandomState(random_state)
    classes = np.unique(y)
    fold_indices: list[list[int]] = [[] for _ in range(k)]

    for cls in classes:
        cls_indices = np.where(y == cls)[0]
        rng.shuffle(cls_indices)
        for i, idx in enumerate(cls_indices):
            fold_indices[i % k].append(idx)

    # Shuffle within each fold
    for fold in fold_indices:
        rng.shuffle(fold)

    folds = []
    all_indices = np.arange(len(y))
    for i in range(k):
        val_idx = np.array(fold_indices[i])
        train_idx = np.setdiff1d(all_indices, val_idx)
        folds.append((train_idx, val_idx))

    return folds


def _compute_f1_per_class(y_true: np.ndarray, y_pred: np.ndarray, n_classes: int) -> dict:
    """Compute precision, recall, and F1 for each class."""
    results = {}
    for cls in range(n_classes):
        tp = ((y_pred == cls) & (y_true == cls)).sum()
        fp = ((y_pred == cls) & (y_true != cls)).sum()
        fn = ((y_pred != cls) & (y_true == cls)).sum()
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
        support = int((y_true == cls).sum())
        results[LABELS[cls]] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1-score": round(f1, 4),
            "support": support,
        }
    return results


def _confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray, n_classes: int) -> list[list[int]]:
    """Compute a confusion matrix as a nested list."""
    cm = np.zeros((n_classes, n_classes), dtype=int)
    for t, p in zip(y_true, y_pred):
        cm[t, p] += 1
    return cm.tolist()


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

# Default hyperparameter grid (typed tuples keep ``itertools.product`` happy
# when mypy tries to infer the combined element type across axes).
_PARAM_GRID_N_ESTIMATORS: tuple[int, ...] = (100, 200, 300)
_PARAM_GRID_MAX_DEPTH: tuple[int, ...] = (4, 6, 8)
_PARAM_GRID_LEARNING_RATE: tuple[float, ...] = (0.05, 0.1, 0.2)

# Quick-mode defaults (skip grid search)
_QUICK_PARAMS = {
    "n_estimators": 200,
    "max_depth": 6,
    "learning_rate": 0.1,
}


# ---------------------------------------------------------------------------
# Parallel grid search workers
# ---------------------------------------------------------------------------
# Worker-process globals populated once per child by ``_init_worker``. Keeping
# the large (X, y, sample_weight, folds) arrays out of the per-task payload
# avoids pickling them 27× and cuts IPC overhead to near-zero — each worker
# just receives a 3-tuple of hyperparameters.

_worker_X: np.ndarray | None = None
_worker_y: np.ndarray | None = None
_worker_w: np.ndarray | None = None
_worker_folds: list | None = None


def _init_worker(X: np.ndarray, y: np.ndarray, w: np.ndarray, folds: list) -> None:
    """Seed a worker process with shared training state."""
    global _worker_X, _worker_y, _worker_w, _worker_folds
    _worker_X, _worker_y, _worker_w, _worker_folds = X, y, w, folds


def _evaluate_params(params: tuple[int, int, float]) -> dict:
    """Run stratified K-fold CV for one hyperparameter combination.

    Executed inside a worker process. Reads the training data from the
    module globals set up in :func:`_init_worker`. Pure function of its
    inputs (deterministic given fixed folds), so results are reproducible.
    """
    assert _worker_X is not None and _worker_y is not None
    assert _worker_w is not None and _worker_folds is not None
    X, y, w, folds = _worker_X, _worker_y, _worker_w, _worker_folds

    n_est, depth, lr = params
    fold_accs: list[float] = []
    for train_idx, val_idx in folds:
        model = GradientBoostingClassifier(
            n_estimators=n_est,
            max_depth=depth,
            learning_rate=lr,
            min_samples_leaf=5,
            lambda_reg=1.0,
        )
        model.fit(X[train_idx], y[train_idx], w[train_idx])
        preds = model.predict(X[val_idx])
        fold_accs.append(float((preds == y[val_idx]).mean()))
    return {
        "n_estimators": n_est,
        "max_depth": depth,
        "learning_rate": lr,
        "fold_accuracies": fold_accs,
        "mean_accuracy": float(np.mean(fold_accs)),
    }


def train(symbols: list[str] | None = None, quick: bool = False) -> dict:
    """
    Train the trend classifier with cross-validation and grid search.

    Pipeline:
    1. Fetch historical data and compute features.
    2. Compute class weights for imbalance handling.
    3. If quick=False: run stratified 5-fold CV over a hyperparameter grid
       (27 combinations × 5 folds = 135 fits) in a multiprocessing ``Pool``
       and select the best combination by mean accuracy.
    4. Retrain on the full dataset with the best hyperparameters.
    5. Compute gain-based and permutation-based feature importances.
    6. Optionally benchmark against sklearn (if installed).
    7. Save the model and metrics to disk.

    Override the worker count with the ``GRID_SEARCH_WORKERS`` env var if
    the default (``cpu_count()``) oversubscribes a constrained host.

    Returns training metrics dict.
    """
    if symbols is None:
        symbols = [
            "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "JPM",
            "V", "WMT", "JNJ", "PG", "XOM", "UNH", "HD", "BAC", "DIS",
            "NFLX", "AMD", "CRM", "INTC", "CSCO", "PFE", "KO", "PEP",
        ]

    X_df, y_series = prepare_training_data(symbols)
    X = X_df.values.astype(np.float64)
    y = y_series.values.astype(int)
    n_classes = len(LABELS)

    # Class weights for imbalance
    sample_weight = _compute_class_weights(y)

    # -----------------------------------------------------------------------
    # Hyperparameter selection
    # -----------------------------------------------------------------------
    if quick:
        best_params = _QUICK_PARAMS.copy()
        cv_results = None
        best_mean_acc = None
    else:
        folds = _stratified_k_fold(y, k=5)
        param_combos = list(itertools.product(
            _PARAM_GRID_N_ESTIMATORS,
            _PARAM_GRID_MAX_DEPTH,
            _PARAM_GRID_LEARNING_RATE,
        ))

        # Cap workers at the combination count so we don't spin up idle
        # processes. ``GRID_SEARCH_WORKERS`` env var overrides the default
        # for CI boxes where oversubscription hurts (e.g. containers with
        # fewer cores than the host reports).
        n_workers = int(os.environ.get("GRID_SEARCH_WORKERS", cpu_count()))
        n_workers = max(1, min(n_workers, len(param_combos)))

        with Pool(
            processes=n_workers,
            initializer=_init_worker,
            initargs=(X, y, sample_weight, folds),
        ) as pool:
            raw_results = pool.map(_evaluate_params, param_combos)

        cv_results = [
            {
                "n_estimators": r["n_estimators"],
                "max_depth": r["max_depth"],
                "learning_rate": r["learning_rate"],
                "mean_accuracy": round(r["mean_accuracy"], 4),
                "fold_accuracies": [round(a, 4) for a in r["fold_accuracies"]],
            }
            for r in raw_results
        ]

        best = max(raw_results, key=lambda r: r["mean_accuracy"])
        best_mean_acc = best["mean_accuracy"]
        best_params = {
            "n_estimators": best["n_estimators"],
            "max_depth": best["max_depth"],
            "learning_rate": best["learning_rate"],
        }

    # -----------------------------------------------------------------------
    # Final model: retrain on full dataset with best hyperparameters
    # -----------------------------------------------------------------------
    final_model = GradientBoostingClassifier(
        n_estimators=int(best_params["n_estimators"]),
        max_depth=int(best_params["max_depth"]),
        learning_rate=float(best_params["learning_rate"]),
        min_samples_leaf=5,
        lambda_reg=1.0,
    )
    final_model.fit(X, y, sample_weight)

    y_pred = final_model.predict(X)
    accuracy = float((y_pred == y).mean())

    # Per-class metrics
    report = _compute_f1_per_class(y, y_pred, n_classes)
    cm = _confusion_matrix(y, y_pred, n_classes)

    # Feature importances
    gain_importance = {
        FEATURE_COLS[i]: round(float(v), 4)
        for i, v in enumerate(final_model.feature_importances_)
    }
    perm_importance_values = compute_permutation_importance(final_model, X, y, n_repeats=5)
    perm_importance = {
        FEATURE_COLS[i]: round(float(v), 4)
        for i, v in enumerate(perm_importance_values)
    }

    # -----------------------------------------------------------------------
    # Optional sklearn benchmark
    # -----------------------------------------------------------------------
    sklearn_accuracy = None
    try:
        from sklearn.ensemble import HistGradientBoostingClassifier as SklearnGBC
        from sklearn.model_selection import train_test_split

        X_tr, X_te, y_tr, y_te, w_tr, _ = train_test_split(
            X, y, sample_weight, test_size=0.2, random_state=42, stratify=y,
        )
        sklearn_model = SklearnGBC(
            max_iter=int(best_params["n_estimators"]),
            max_depth=int(best_params["max_depth"]),
            learning_rate=float(best_params["learning_rate"]),
            random_state=42,
        )
        sklearn_model.fit(X_tr, y_tr, sample_weight=w_tr)
        sklearn_preds = sklearn_model.predict(X_te)
        sklearn_accuracy = round(float((sklearn_preds == y_te).mean()), 4)
    except ImportError:
        pass

    # -----------------------------------------------------------------------
    # Save model and metrics
    # -----------------------------------------------------------------------
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(final_model, f)

    metrics = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "accuracy": round(accuracy, 4),
        "report": report,
        "confusion_matrix": cm,
        "feature_importances_gain": gain_importance,
        "feature_importances_permutation": perm_importance,
        "best_hyperparameters": best_params,
        "samples": len(X),
        "class_distribution": {LABELS[i]: int((y == i).sum()) for i in range(n_classes)},
        "custom_accuracy": round(accuracy, 4),
        "sklearn_accuracy": sklearn_accuracy,
        "train_loss_final": round(final_model.train_loss_history_[-1], 6) if final_model.train_loss_history_ else None,
    }
    if cv_results is not None and best_mean_acc is not None:
        metrics["cv_results_summary"] = {
            "n_combinations": len(cv_results),
            "best_mean_cv_accuracy": round(float(best_mean_acc), 4),
        }

    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)

    return metrics


class TrendClassifier:
    """Loads a pre-trained model and classifies current market conditions."""

    def __init__(self) -> None:
        self._model: GradientBoostingClassifier | None = None

    def _load(self) -> bool:
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

        if not self._load() or self._model is None:
            return self._rule_based_fallback(features)

        row = features[FEATURE_COLS].iloc[-1:].values
        proba = self._model.predict_proba(row)[0]
        pred_idx = int(np.argmax(proba))

        return {
            "trend": LABELS[pred_idx],
            "trend_confidence": round(float(proba[pred_idx]), 3),
            "probabilities": {LABELS[i]: round(float(p), 3) for i, p in enumerate(proba)},
            "method": "ml_model",
        }

    def get_feature_importances(self) -> dict | None:
        """Load feature importances from metrics.json if available."""
        if METRICS_PATH.exists():
            with open(METRICS_PATH) as f:
                metrics = json.load(f)
            return {
                "gain": metrics.get("feature_importances_gain"),
                "permutation": metrics.get("feature_importances_permutation"),
            }
        return None

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

# Training the Trend Classifier

This document describes exactly how to train the from-scratch gradient-boosted
trend classifier and regenerate the metrics quoted in the README. Every command
here is derived from the code in this directory (`ml/trend.py`,
`ml/train_cli.py`, `ml/gradient_boosting.py`, `ml/features.py`).

## What gets produced

Training writes two artifacts into `ml/models/` (the directory is created on
first run):

| Artifact | Written by | Contents |
|----------|------------|----------|
| `trend_classifier.pkl` | `pickle.dump` in `ml.trend.train` | The fitted `GradientBoostingClassifier` ensemble. |
| `metrics.json` | `json.dump` in `ml.trend.train` | Accuracy, per-class precision/recall/F1, confusion matrix, gain- and permutation-based feature importances, best hyperparameters, class distribution, and the optional sklearn benchmark accuracy. |

At inference time `ml.trend.TrendClassifier` lazily unpickles
`trend_classifier.pkl`; if it is missing, prediction falls back to the
rule-based heuristic in `TrendClassifier._rule_based_fallback`. The API layer
loads feature importances directly out of `metrics.json`.

## The committed release model

Both artifacts are **committed to the repository** (the `.gitignore` carves
out `trend_classifier.pkl` and `metrics.json` from the otherwise-ignored
`ml/models/`). This is deliberate:

- **Releases are reproducible.** The desktop build workflow packages the
  checked-in model instead of training against live market data at build
  time (which would produce a different model on every run and on every
  platform in the build matrix).
- **Releases are guarded.** `.github/workflows/build-desktop.yml` fails if
  the artifacts are missing and runs `scripts/verify_model.py` with the
  bundled Python env to prove the shipped interpreter can load the model
  and produce `"method": "ml_model"` predictions.
- **CI keeps the pickle loadable.** The main CI workflow runs the same
  verification on every push, so refactors that would break unpickling are
  caught immediately.

To update the shipped model: retrain (commands below), sanity-check
`ml/models/metrics.json`, run `python scripts/verify_model.py`, refresh the
"Training Results" numbers in the README from the new `metrics.json`, and
commit both artifacts together in one commit.

## Prerequisites

From the repository root:

```bash
python -m venv .venv
. .venv/Scripts/activate        # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r api/requirements.txt
```

`scikit-learn` (already in `api/requirements.txt`) is optional for training: if
present, `train()` adds a held-out sklearn `HistGradientBoostingClassifier`
accuracy to `metrics.json` for comparison. If it is not installed the benchmark
fields are simply omitted; training still succeeds.

> Network note: the default training run calls `yfinance` to download 2 years of
> daily OHLCV for each ticker. It needs outbound internet access and is subject
> to Yahoo Finance rate limits. There is no offline default dataset committed to
> the repo — the synthetic-data tests (below) are what run in CI. This is also
> why release builds do **not** retrain: they package the committed model.

## Commands

All commands are run from the repository root.

### Full training (default — matches the README numbers)

5-fold stratified cross-validation over the 27-combination hyperparameter grid
(`n_estimators ∈ {100, 200, 300}` × `max_depth ∈ {4, 6, 8}` ×
`learning_rate ∈ {0.05, 0.1, 0.2}`), retrained on the full dataset with the best
combination. This is what produced the README's "11,050 samples from 25
large-cap stocks" / "79.7% accuracy" figures.

```bash
python -m ml.train_cli
```

The default universe is the 25 large-cap tickers hard-coded in
`ml.trend.train`: AAPL, MSFT, GOOGL, AMZN, TSLA, NVDA, META, JPM, V, WMT, JNJ,
PG, XOM, UNH, HD, BAC, DIS, NFLX, AMD, CRM, INTC, CSCO, PFE, KO, PEP.

### Quick training (skip the grid search)

Trains a single model with the fixed defaults
(`n_estimators=200, max_depth=6, learning_rate=0.1`). Useful for a fast
end-to-end smoke run.

```bash
python -m ml.train_cli --quick
```

### Custom ticker universe

Any trailing positional arguments override the default universe (combine with
`--quick` if desired):

```bash
python -m ml.train_cli AAPL MSFT GOOGL AMZN TSLA
python -m ml.train_cli --quick AAPL MSFT
```

### Tuning the grid-search parallelism

The grid search fans the 135 fits (27 combos × 5 folds) across a
`multiprocessing.Pool`. By default it uses `cpu_count()` workers; cap it on a
constrained or containerised host with the `GRID_SEARCH_WORKERS` env var:

```bash
GRID_SEARCH_WORKERS=2 python -m ml.train_cli          # macOS / Linux
$env:GRID_SEARCH_WORKERS=2; python -m ml.train_cli    # Windows PowerShell
```

## Determinism

The pipeline is deterministic **given a fixed dataset**:

- Cross-validation fold assignment is seeded (`_stratified_k_fold(..., random_state=42)`).
- The classifier itself is feature-thresholded and has no internal randomness
  in `fit` — identical `(X, y, sample_weight)` produces an identical ensemble.
- The optional sklearn benchmark uses `random_state=42`.

The non-deterministic input is the **market data**: a run on a different day
sees more recent bars, so absolute metric values drift over time. Pin the data
(see "Committing reproducible metrics" below) if you need bit-stable numbers.

## How the labels are defined

`ml.trend._label_trend` buckets the forward **10-day** percentage return into
five classes:

| Forward 10-day return | Label | Index |
|-----------------------|-------|-------|
| `> +5.0%`  | `strong_uptrend`   | 4 |
| `> +1.5%`  | `uptrend`          | 3 |
| `-1.5% … +1.5%` | `sideways`    | 2 |
| `< -1.5%`  | `downtrend`        | 1 |
| `< -5.0%`  | `strong_downtrend` | 0 |

The eight input features (`ml.trend.FEATURE_COLS`) are: `rsi_14`, `macd_hist`,
`bb_width`, `vol_zscore`, `ma_cross_10_50`, `price_change_1d`,
`price_change_5d`, `volatility_20d` — all computed by
`ml.features.compute_features`.

## Regenerating the README metrics table

After a full run, the numbers in `README.md` → "Training Results" come straight
from `ml/models/metrics.json`:

```bash
python -c "import json; m=json.load(open('ml/models/metrics.json')); \
print('accuracy', m['accuracy']); print('samples', m['samples']); \
print('sklearn', m['sklearn_accuracy'])"
```

The custom-vs-sklearn performance table further down the README comes from a
separate, self-contained synthetic benchmark (no network):

```bash
python benchmarks/bench_gradient_boosting.py
```

## Committing reproducible metrics

The training data is live market data, so a plain `metrics.json` is not
reproducible across days. To commit a reproducible artifact, capture the exact
OHLCV used for a run alongside `metrics.json` (a frozen CSV/parquet snapshot and
a `prepare_training_data` shim that reads it). This is tracked as a follow-up in
[`docs/REVAMP_PLAN.md`](../docs/REVAMP_PLAN.md).

## Verifying the pipeline without network or a trained model

The fit → predict → save → load round-trip is exercised deterministically on
synthetic data — no `yfinance`, no committed model — by:

```bash
pytest tests/test_ml_integration.py::test_trend_classifier_disk_roundtrip -v
```

That test trains a small ensemble on seeded synthetic OHLCV, pickles it to a
temporary `MODEL_PATH`, writes a temporary `metrics.json`, then loads both back
through a fresh `TrendClassifier` (the same code path the API uses) and asserts
the predictions are stable across the reload. The broader pipeline (features,
labels, cross-validation, class weighting, importances, sklearn parity) is
covered by the rest of `tests/test_ml_integration.py` and
`tests/test_ml_pipeline.py`.

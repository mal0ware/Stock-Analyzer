#!/usr/bin/env python3
"""
CLI script to train the trend classifier model.

Usage:
    python -m ml.train_cli                    # Full grid search (27 combos x 5 folds)
    python -m ml.train_cli --quick            # Skip grid search, use defaults
    python -m ml.train_cli AAPL MSFT GOOGL    # Train with specific tickers
    python -m ml.train_cli --quick AAPL MSFT  # Quick mode + specific tickers

Outputs:
    ml/models/trend_classifier.pkl   — trained model
    ml/models/metrics.json           — accuracy, F1, confusion matrix, importances
"""

import sys
import time


def main():
    from ml.trend import train

    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    quick = "--quick" in sys.argv

    symbols = args if args else None

    print("=" * 60)
    print("Stock Analyzer — Trend Classifier Training")
    print("=" * 60)

    if symbols:
        print(f"Training on {len(symbols)} symbols: {', '.join(symbols)}")
    else:
        print("Training on default universe (25 large-cap tickers)")

    if quick:
        print("Mode: QUICK (skipping grid search, using default hyperparameters)")
    else:
        print("Mode: FULL (5-fold CV over 27 hyperparameter combinations)")

    print()
    start = time.time()

    try:
        metrics = train(symbols, quick=quick)
        elapsed = time.time() - start

        print(f"Training complete in {elapsed:.1f}s")
        print(f"  Samples:  {metrics['samples']}")
        print(f"  Accuracy: {metrics['accuracy']:.1%}")
        print()

        # Best hyperparameters
        best = metrics["best_hyperparameters"]
        print("Best hyperparameters:")
        print(f"  n_estimators:  {best['n_estimators']}")
        print(f"  max_depth:     {best['max_depth']}")
        print(f"  learning_rate: {best['learning_rate']}")
        print()

        # Class distribution
        print("Class distribution:")
        for label, count in metrics["class_distribution"].items():
            pct = count / metrics["samples"] * 100
            print(f"  {label:20s}  {count:>6d}  ({pct:.1f}%)")
        print()

        # Per-class metrics
        print("Per-class metrics:")
        for label, stats in metrics["report"].items():
            if isinstance(stats, dict) and "f1-score" in stats:
                print(
                    f"  {label:20s}  precision={stats['precision']:.2f}  "
                    f"recall={stats['recall']:.2f}  f1={stats['f1-score']:.2f}  "
                    f"support={stats['support']}"
                )
        print()

        # Feature importances
        print("Feature importances (gain-based):")
        gain = metrics["feature_importances_gain"]
        for feat, imp in sorted(gain.items(), key=lambda x: x[1], reverse=True):
            bar = "█" * int(imp * 40)
            print(f"  {feat:20s}  {imp:.4f}  {bar}")
        print()

        print("Feature importances (permutation-based):")
        perm = metrics["feature_importances_permutation"]
        for feat, imp in sorted(perm.items(), key=lambda x: x[1], reverse=True):
            bar = "█" * int(max(0, imp) * 40)
            print(f"  {feat:20s}  {imp:+.4f}  {bar}")
        print()

        # Sklearn comparison
        if metrics.get("sklearn_accuracy") is not None:
            print("Benchmark comparison:")
            print(f"  Custom model accuracy:  {metrics['custom_accuracy']:.1%}")
            print(f"  sklearn accuracy:       {metrics['sklearn_accuracy']:.1%}")
            diff = metrics["custom_accuracy"] - metrics["sklearn_accuracy"]
            print(f"  Difference:             {diff:+.1%}")
        else:
            print("(sklearn not installed — benchmark comparison skipped)")

        # CV summary
        if metrics.get("cv_results_summary"):
            cv = metrics["cv_results_summary"]
            print()
            print(f"Cross-validation: {cv['n_combinations']} combinations tested, "
                  f"best mean CV accuracy = {cv['best_mean_cv_accuracy']:.1%}")

        print()
        print("Model saved to ml/models/trend_classifier.pkl")
        print("Metrics saved to ml/models/metrics.json")
    except Exception as e:
        print(f"Training failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

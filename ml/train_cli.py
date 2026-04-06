#!/usr/bin/env python3
"""
CLI script to train the trend classifier model.

Usage:
    python -m ml.train_cli                    # Train with default 25 tickers
    python -m ml.train_cli AAPL MSFT GOOGL    # Train with specific tickers

Outputs a pickled model to ml/models/trend_classifier.pkl
"""

import sys
import time


def main():
    from ml.trend import train

    symbols = sys.argv[1:] if len(sys.argv) > 1 else None

    print("=" * 60)
    print("AI Market Analyst — Trend Classifier Training")
    print("=" * 60)

    if symbols:
        print(f"Training on {len(symbols)} symbols: {', '.join(symbols)}")
    else:
        print("Training on default universe (25 large-cap tickers)")

    print()
    start = time.time()

    try:
        metrics = train(symbols)
        elapsed = time.time() - start

        print(f"Training complete in {elapsed:.1f}s")
        print(f"  Samples:  {metrics['samples']}")
        print(f"  Accuracy: {metrics['accuracy']:.1%}")
        print()
        print("Per-class metrics:")
        for label, stats in metrics["report"].items():
            if isinstance(stats, dict) and "f1-score" in stats:
                print(f"  {label:20s}  precision={stats['precision']:.2f}  recall={stats['recall']:.2f}  f1={stats['f1-score']:.2f}")

        print()
        print("Model saved to ml/models/trend_classifier.pkl")
    except Exception as e:
        print(f"Training failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

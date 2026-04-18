#!/usr/bin/env python3
"""
Benchmark: API endpoint latency.

Measures p50/p95/p99 latency for the snapshot and sentiment endpoints
using mocked yfinance data (no network calls).

Run: python benchmarks/bench_endpoints.py
Results saved to benchmarks/results_endpoints.json
"""

import json
import sys
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd

# Add api/ and repo root to path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _mock_ticker(symbol: str = "TEST"):
    """Create a mock yfinance Ticker with realistic data."""
    mock = MagicMock()

    # fast_info
    mock.fast_info.last_price = 175.50
    mock.fast_info.previous_close = 173.20
    mock.fast_info.last_volume = 52_000_000
    mock.fast_info.market_cap = 2_800_000_000_000

    # history
    np.random.seed(42)
    n = 90
    dates = pd.date_range(end="2026-04-16", periods=n, freq="B")
    close = 150 + np.cumsum(np.random.randn(n) * 1.5)
    hist = pd.DataFrame({
        "Open": close + np.random.randn(n) * 0.5,
        "High": close + abs(np.random.randn(n) * 1.0),
        "Low": close - abs(np.random.randn(n) * 1.0),
        "Close": close,
        "Volume": np.random.randint(30_000_000, 80_000_000, n),
    }, index=dates)
    mock.history.return_value = hist

    # news
    mock.news = [
        {"title": "Company beats Q3 earnings expectations"},
        {"title": "New product launch drives stock higher"},
        {"title": "Analyst upgrades rating to buy"},
    ]

    return mock


def _percentiles(latencies: list[float]) -> dict:
    """Compute p50, p95, p99 from a list of latencies (seconds)."""
    arr = np.array(latencies) * 1000  # Convert to ms
    return {
        "p50_ms": round(float(np.percentile(arr, 50)), 2),
        "p95_ms": round(float(np.percentile(arr, 95)), 2),
        "p99_ms": round(float(np.percentile(arr, 99)), 2),
        "mean_ms": round(float(arr.mean()), 2),
        "n_requests": len(latencies),
    }


def main():
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)
    mock_ticker = _mock_ticker()
    n_requests = 50

    print("=" * 60)
    print("API Endpoint Benchmark")
    print("=" * 60)

    results = {}

    # Benchmark: /api/health (baseline)
    print("\nBenchmarking /api/health (baseline)...")
    latencies = []
    for _ in range(n_requests):
        start = time.perf_counter()
        resp = client.get("/api/health")
        latencies.append(time.perf_counter() - start)
        assert resp.status_code == 200
    results["health"] = _percentiles(latencies)
    print(f"  p50={results['health']['p50_ms']:.1f}ms  p95={results['health']['p95_ms']:.1f}ms")

    # Benchmark: /api/v1/symbols/{symbol}/snapshot (with mocked yfinance)
    print("\nBenchmarking /api/v1/symbols/TEST/snapshot...")
    latencies = []
    with patch("yfinance.Ticker", return_value=mock_ticker):
        for _ in range(n_requests):
            start = time.perf_counter()
            resp = client.get("/api/v1/symbols/TEST/snapshot")
            latencies.append(time.perf_counter() - start)
    results["snapshot"] = _percentiles(latencies)
    print(f"  p50={results['snapshot']['p50_ms']:.1f}ms  p95={results['snapshot']['p95_ms']:.1f}ms")

    # Benchmark: /api/glossary (cached endpoint)
    print("\nBenchmarking /api/glossary (cached)...")
    latencies = []
    for _ in range(n_requests):
        start = time.perf_counter()
        resp = client.get("/api/glossary")
        latencies.append(time.perf_counter() - start)
    results["glossary"] = _percentiles(latencies)
    print(f"  p50={results['glossary']['p50_ms']:.1f}ms  p95={results['glossary']['p95_ms']:.1f}ms")

    out = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "n_requests_per_endpoint": n_requests,
        "endpoints": results,
    }

    out_path = Path(__file__).parent / "results_endpoints.json"
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    main()

"""
Integration tests for the snapshot endpoint with mocked yfinance.

Verifies that ML signals are present and valid in the API response,
and that graceful degradation works when no trained model exists.
"""

import sys
import os
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def mock_ticker():
    """Create a realistic mock yfinance Ticker."""
    mock = MagicMock()

    mock.fast_info.last_price = 175.50
    mock.fast_info.previous_close = 173.20
    mock.fast_info.last_volume = 52_000_000
    mock.fast_info.market_cap = 2_800_000_000_000

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

    mock.news = [
        {"title": "Company beats Q3 earnings expectations"},
        {"title": "New product launch drives stock higher"},
        {"title": "Analyst upgrades rating to buy"},
    ]

    return mock


@pytest.fixture
def api_client():
    """Create a FastAPI test client."""
    from fastapi.testclient import TestClient
    from main import app
    return TestClient(app)


def test_snapshot_returns_ml_signals(api_client, mock_ticker):
    """Snapshot endpoint should return trend, anomaly, and sentiment signals."""
    with patch("yfinance.Ticker", return_value=mock_ticker):
        resp = api_client.get("/api/v1/symbols/AAPL/snapshot")

    assert resp.status_code == 200
    data = resp.json()

    # Price data present
    assert "price" in data
    assert data["price"]["current"] is not None

    # ML signals present
    assert "signals" in data
    signals = data["signals"]
    assert signals["trend"] in [
        "strong_uptrend", "uptrend", "sideways", "downtrend", "strong_downtrend",
        "insufficient_data",
    ]
    assert 0.0 <= signals["trend_confidence"] <= 1.0
    assert 0.0 <= signals["anomaly_score"] <= 1.0
    assert isinstance(signals["anomaly_flag"], bool)

    # Sentiment present
    assert "sentiment" in data


def test_snapshot_graceful_degradation(api_client, mock_ticker):
    """Without a trained model, snapshot should still work with rule-based fallback."""
    # Ensure no model file exists by patching MODEL_PATH
    with patch("yfinance.Ticker", return_value=mock_ticker), \
         patch("ml.trend.MODEL_PATH") as mock_path:
        mock_path.exists.return_value = False

        # Need a fresh classifier instance without cached model
        from ml.trend import TrendClassifier
        fresh_clf = TrendClassifier()
        with patch("routes.snapshot.trend_classifier", fresh_clf):
            resp = api_client.get("/api/v1/symbols/AAPL/snapshot")

    assert resp.status_code == 200
    data = resp.json()
    assert "signals" in data
    # Should still have a valid trend prediction
    assert data["signals"]["trend"] in [
        "strong_uptrend", "uptrend", "sideways", "downtrend", "strong_downtrend",
        "insufficient_data",
    ]

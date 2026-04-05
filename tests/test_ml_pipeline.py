"""
Tests for the ML pipeline — features, trend classifier, anomaly detector, sentiment scorer.
"""

import sys
import os

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ml.features import compute_features, rsi, macd, bollinger_width, volume_zscore
from ml.trend import TrendClassifier
from ml.anomaly import AnomalyDetector
from ml.sentiment import SentimentScorer, SentimentResult


# ---------------------------------------------------------------------------
# Feature engineering tests
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_ohlcv():
    """Generate a synthetic OHLCV DataFrame with 100 rows."""
    np.random.seed(42)
    n = 100
    close = 100 + np.cumsum(np.random.randn(n) * 0.5)
    return pd.DataFrame({
        "open": close + np.random.randn(n) * 0.1,
        "high": close + abs(np.random.randn(n) * 0.5),
        "low": close - abs(np.random.randn(n) * 0.5),
        "close": close,
        "volume": np.random.randint(1_000_000, 10_000_000, n),
    })


def test_rsi_range(sample_ohlcv):
    result = rsi(sample_ohlcv["close"], 14)
    valid = result.dropna()
    assert len(valid) > 0
    assert valid.min() >= 0
    assert valid.max() <= 100


def test_macd_returns_two_series(sample_ohlcv):
    macd_line, signal_line = macd(sample_ohlcv["close"])
    assert len(macd_line) == len(sample_ohlcv)
    assert len(signal_line) == len(sample_ohlcv)


def test_bollinger_width_positive(sample_ohlcv):
    bw = bollinger_width(sample_ohlcv["close"], 20)
    valid = bw.dropna()
    assert (valid >= 0).all()


def test_volume_zscore(sample_ohlcv):
    vz = volume_zscore(sample_ohlcv["volume"], 20)
    valid = vz.dropna()
    assert len(valid) > 0
    # Z-scores should be roughly centered around 0
    assert abs(valid.mean()) < 1.0


def test_compute_features_output(sample_ohlcv):
    result = compute_features(sample_ohlcv)
    assert "rsi_14" in result.columns
    assert "macd_line" in result.columns
    assert "macd_signal" in result.columns
    assert "macd_hist" in result.columns
    assert "bb_width" in result.columns
    assert "vol_zscore" in result.columns
    assert "ma_cross_10_50" in result.columns
    assert "volatility_20d" in result.columns
    # Should have fewer rows due to dropna
    assert len(result) < len(sample_ohlcv)
    assert len(result) > 0


# ---------------------------------------------------------------------------
# Trend classifier tests
# ---------------------------------------------------------------------------

def test_trend_classifier_rule_based(sample_ohlcv):
    """Without a trained model, should fall back to rule-based."""
    clf = TrendClassifier()
    result = clf.predict(sample_ohlcv)
    assert "trend" in result
    assert result["trend"] in [
        "strong_uptrend", "uptrend", "sideways", "downtrend", "strong_downtrend",
        "insufficient_data",
    ]
    assert "trend_confidence" in result
    assert 0.0 <= result["trend_confidence"] <= 1.0


def test_trend_classifier_insufficient_data():
    """Very short DataFrame should return insufficient_data."""
    clf = TrendClassifier()
    tiny = pd.DataFrame({
        "open": [100, 101], "high": [102, 103],
        "low": [99, 100], "close": [101, 102], "volume": [1000, 2000],
    })
    result = clf.predict(tiny)
    assert result["trend"] == "insufficient_data"


# ---------------------------------------------------------------------------
# Anomaly detector tests
# ---------------------------------------------------------------------------

def test_anomaly_detector_normal(sample_ohlcv):
    det = AnomalyDetector()
    result = det.detect(sample_ohlcv)
    assert "anomaly_score" in result
    assert 0.0 <= result["anomaly_score"] <= 1.0
    assert isinstance(result["anomaly_flag"], bool)
    assert "features" in result


def test_anomaly_detector_with_spike(sample_ohlcv):
    """Inject a massive volume spike — should increase anomaly score."""
    det = AnomalyDetector()
    normal_result = det.detect(sample_ohlcv)

    spiked = sample_ohlcv.copy()
    spiked.iloc[-1, spiked.columns.get_loc("volume")] = 500_000_000  # 50x normal
    spiked.iloc[-1, spiked.columns.get_loc("close")] = spiked.iloc[-2]["close"] * 1.15  # +15%
    spike_result = det.detect(spiked)

    # The spike should register as more anomalous
    assert spike_result["anomaly_score"] >= normal_result["anomaly_score"]


def test_anomaly_detector_short_data():
    det = AnomalyDetector()
    tiny = pd.DataFrame({
        "open": [100], "high": [102], "low": [99], "close": [101], "volume": [1000],
    })
    result = det.detect(tiny)
    assert result["anomaly_score"] == 0.0
    assert result["anomaly_flag"] is False


# ---------------------------------------------------------------------------
# Sentiment scorer tests
# ---------------------------------------------------------------------------

def test_sentiment_positive():
    scorer = SentimentScorer()
    result = scorer.score_text("Company reports record profits, stock surges to all-time high")
    assert isinstance(result, SentimentResult)
    assert result.label in ("positive", "negative", "neutral")
    assert -1.0 <= result.score <= 1.0
    # This text is clearly positive
    assert result.score > 0 or result.label == "positive"


def test_sentiment_negative():
    scorer = SentimentScorer()
    result = scorer.score_text("Company faces bankruptcy after massive fraud scandal, stock plunges")
    assert result.score < 0 or result.label == "negative"


def test_sentiment_batch():
    scorer = SentimentScorer()
    texts = [
        "Stock rallies on strong earnings beat",
        "Company announces major layoffs",
        "Market closes flat on light volume",
    ]
    results = scorer.score_batch(texts)
    assert len(results) == 3


def test_sentiment_aggregate():
    scorer = SentimentScorer()
    results = [
        SentimentResult(label="positive", score=0.5, confidence=0.8, method="vader"),
        SentimentResult(label="positive", score=0.3, confidence=0.6, method="vader"),
        SentimentResult(label="negative", score=-0.2, confidence=0.4, method="vader"),
    ]
    agg = scorer.aggregate(results)
    assert "score" in agg
    assert "label" in agg
    assert "count" in agg
    assert agg["count"] == 3
    assert agg["score"] is not None


def test_sentiment_empty():
    scorer = SentimentScorer()
    agg = scorer.aggregate([])
    assert agg["score"] is None
    assert agg["count"] == 0

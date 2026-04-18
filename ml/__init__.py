"""
ML pipeline package — trend classification, anomaly detection, sentiment.

Re-exports the three long-lived singletons used by the API layer:

* :data:`trend_classifier` — gradient-boosted directional classifier
  producing ``up / flat / down`` probabilities from engineered features.
* :data:`anomaly_detector` — per-symbol Isolation Forest + z-score
  composite returning a 0–1 anomaly score per tick.
* :data:`sentiment_scorer` — lexicon-based sentiment model used over news
  headlines and Reddit titles.

All three are cheap to instantiate once; keeping a module-level singleton
avoids repeatedly rebuilding the models for every request.
"""

from .trend import classifier as trend_classifier
from .anomaly import detector as anomaly_detector
from .sentiment import scorer as sentiment_scorer

__all__ = ["trend_classifier", "anomaly_detector", "sentiment_scorer"]

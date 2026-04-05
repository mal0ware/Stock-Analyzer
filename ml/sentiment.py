"""
Sentiment Scorer — analyzes financial text for sentiment.

Strategy:
  1. Try FinBERT (ProsusAI/finbert) if transformers is installed
  2. Fall back to VADER with financial lexicon overlay
  3. Always works offline (VADER ships with nltk, FinBERT caches locally)

Output per text: {"label": str, "score": float, "confidence": float}
"""

from dataclasses import dataclass


@dataclass
class SentimentResult:
    label: str  # "positive", "negative", "neutral"
    score: float  # -1.0 to 1.0
    confidence: float  # 0.0 to 1.0
    method: str  # "finbert" or "vader"


# Financial-specific lexicon additions for VADER
_FINANCIAL_LEXICON = {
    "bullish": 2.0, "bearish": -2.0,
    "upgrade": 1.5, "downgrade": -1.5,
    "outperform": 1.5, "underperform": -1.5,
    "beat": 1.0, "miss": -1.0, "missed": -1.0,
    "rally": 1.5, "crash": -2.5, "plunge": -2.0, "surge": 2.0, "soar": 2.0,
    "bankruptcy": -3.0, "default": -2.0, "layoff": -1.5, "layoffs": -1.5,
    "dividend": 0.5, "buyback": 1.0, "acquisition": 0.5,
    "recession": -2.0, "inflation": -0.5,
    "profit": 1.0, "loss": -1.0, "revenue": 0.3,
    "overvalued": -1.0, "undervalued": 1.0,
    "breakout": 1.5, "breakdown": -1.5,
    "squeeze": 1.0, "short": -0.5,
    "moon": 1.5, "rocket": 1.0, "dip": -0.5,
    "hodl": 0.5, "diamond": 0.5,
}


class SentimentScorer:
    """Scores financial text for sentiment."""

    def __init__(self):
        self._finbert = None
        self._vader = None
        self._method = None

    def _init_scorer(self):
        if self._method is not None:
            return

        # Try FinBERT first
        try:
            from transformers import pipeline
            self._finbert = pipeline(
                "sentiment-analysis",
                model="ProsusAI/finbert",
                top_k=None,
            )
            self._method = "finbert"
            return
        except (ImportError, Exception):
            pass

        # Fall back to VADER
        try:
            import nltk
            try:
                nltk.data.find("sentiment/vader_lexicon.zip")
            except LookupError:
                nltk.download("vader_lexicon", quiet=True)
            from nltk.sentiment.vader import SentimentIntensityAnalyzer
            self._vader = SentimentIntensityAnalyzer()
            # Add financial lexicon
            self._vader.lexicon.update(_FINANCIAL_LEXICON)
            self._method = "vader"
            return
        except (ImportError, Exception):
            pass

        self._method = "none"

    def score_text(self, text: str) -> SentimentResult:
        """Score a single piece of text."""
        self._init_scorer()

        if self._method == "finbert":
            return self._score_finbert(text)
        elif self._method == "vader":
            return self._score_vader(text)
        else:
            return SentimentResult(label="neutral", score=0.0, confidence=0.0, method="unavailable")

    def score_batch(self, texts: list[str]) -> list[SentimentResult]:
        """Score multiple texts."""
        return [self.score_text(t) for t in texts if t.strip()]

    def aggregate(self, results: list[SentimentResult]) -> dict:
        """
        Compute aggregate sentiment from a list of results.
        Returns weighted average score, label distribution, and confidence.
        """
        if not results:
            return {"score": None, "label": "neutral", "confidence": 0.0, "count": 0}

        scores = [r.score for r in results]
        confidences = [r.confidence for r in results]
        avg_score = sum(s * c for s, c in zip(scores, confidences)) / max(sum(confidences), 1e-6)
        avg_confidence = sum(confidences) / len(confidences)

        labels = [r.label for r in results]
        distribution = {
            "positive": labels.count("positive"),
            "negative": labels.count("negative"),
            "neutral": labels.count("neutral"),
        }

        if avg_score > 0.15:
            label = "positive"
        elif avg_score < -0.15:
            label = "negative"
        else:
            label = "neutral"

        return {
            "score": round(avg_score, 3),
            "label": label,
            "confidence": round(avg_confidence, 3),
            "count": len(results),
            "distribution": distribution,
            "method": results[0].method if results else "none",
        }

    def _score_finbert(self, text: str) -> SentimentResult:
        try:
            results = self._finbert(text[:512])
            if not results:
                return SentimentResult(label="neutral", score=0.0, confidence=0.0, method="finbert")

            scores_dict = {r["label"]: r["score"] for r in results[0]}
            pos = scores_dict.get("positive", 0)
            neg = scores_dict.get("negative", 0)
            neu = scores_dict.get("neutral", 0)

            score = pos - neg  # -1 to 1 range
            best_label = max(scores_dict, key=scores_dict.get)
            confidence = scores_dict[best_label]

            return SentimentResult(label=best_label, score=round(score, 3), confidence=round(confidence, 3), method="finbert")
        except Exception:
            return SentimentResult(label="neutral", score=0.0, confidence=0.0, method="finbert")

    def _score_vader(self, text: str) -> SentimentResult:
        try:
            scores = self._vader.polarity_scores(text)
            compound = scores["compound"]

            if compound >= 0.05:
                label = "positive"
            elif compound <= -0.05:
                label = "negative"
            else:
                label = "neutral"

            confidence = abs(compound)
            return SentimentResult(label=label, score=round(compound, 3), confidence=round(confidence, 3), method="vader")
        except Exception:
            return SentimentResult(label="neutral", score=0.0, confidence=0.0, method="vader")


# Module-level singleton
scorer = SentimentScorer()

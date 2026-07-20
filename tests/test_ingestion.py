"""
Tests for the data-ingestion layer's failure observability.

The analyzer's numbers must be trustworthy, so a fetch that fails can never
vanish silently. These tests pin down the reliability contract: a failed
symbol is logged with structured context, and a partial failure still returns
the good symbols while surfacing the failure to both the logs and the caller.
"""

import asyncio
import os
import sys
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from structlog.testing import capture_logs

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

from ingestion.base import MarketDataPoint  # noqa: E402
from ingestion.yahoo import YahooFinanceSource  # noqa: E402


def _good_point(symbol: str) -> MarketDataPoint:
    return MarketDataPoint(
        symbol=symbol.upper(),
        timestamp=datetime.now(timezone.utc),
        open=100.0,
        high=101.0,
        low=99.0,
        close=100.5,
        volume=1_000,
        source="yahoo",
    )


def test_fetch_one_logs_and_reraises_on_error():
    """A genuine fetch error is logged with context and re-raised, not swallowed."""
    source = YahooFinanceSource()

    with patch("ingestion.yahoo.yf.Ticker", side_effect=RuntimeError("simulated upstream 500")):
        with capture_logs() as logs:
            with pytest.raises(RuntimeError):
                source._fetch_one("BAD")

    failures = [e for e in logs if e["event"] == "yahoo.fetch_one_failed"]
    assert len(failures) == 1
    entry = failures[0]
    assert entry["symbol"] == "BAD"
    assert entry["source"] == "yahoo"
    assert entry["error_type"] == "RuntimeError"
    assert "simulated upstream 500" in entry["error"]
    assert entry["log_level"] == "warning"


def test_fetch_partial_failure_returns_good_and_is_observable():
    """One bad symbol is dropped, but the good ones return and the failure is surfaced."""
    source = YahooFinanceSource()

    def fake_fetch_one(symbol: str) -> MarketDataPoint:
        if symbol == "BAD":
            raise RuntimeError("simulated upstream 500")
        return _good_point(symbol)

    with patch.object(source, "_fetch_one", side_effect=fake_fetch_one):
        with capture_logs() as logs:
            results = asyncio.run(source.fetch(["AAPL", "BAD", "MSFT"]))

    # Good symbols are still returned — a partial failure is not a total loss.
    assert [p.symbol for p in results] == ["AAPL", "MSFT"]

    # The failure is surfaced to the caller without breaking the return type.
    assert source.last_failed_symbols == ["BAD"]

    # ...and it is observable in the logs as a structured summary.
    summaries = [e for e in logs if e["event"] == "yahoo.fetch_partial_failure"]
    assert len(summaries) == 1
    summary = summaries[0]
    assert summary["failed"] == ["BAD"]
    assert summary["fetched"] == 2
    assert summary["requested"] == 3
    assert summary["log_level"] == "warning"


def test_fetch_all_success_records_no_failures_and_stays_quiet():
    """A fully successful fetch surfaces no failures and emits no failure summary."""
    source = YahooFinanceSource()

    with patch.object(source, "_fetch_one", side_effect=lambda s: _good_point(s)):
        with capture_logs() as logs:
            results = asyncio.run(source.fetch(["AAPL", "MSFT"]))

    assert [p.symbol for p in results] == ["AAPL", "MSFT"]
    assert source.last_failed_symbols == []
    assert [e for e in logs if e["event"] == "yahoo.fetch_partial_failure"] == []


def test_fetch_treats_empty_data_as_no_failure():
    """A symbol that legitimately has no data is not counted as a failure."""
    source = YahooFinanceSource()

    with patch.object(source, "_fetch_one", side_effect=lambda s: None):
        with capture_logs() as logs:
            results = asyncio.run(source.fetch(["AAPL"]))

    assert results == []
    assert source.last_failed_symbols == []
    assert [e for e in logs if e["event"] == "yahoo.fetch_partial_failure"] == []


def test_healthcheck_logs_on_failure():
    """A failing healthcheck returns False but logs the reason instead of hiding it."""
    source = YahooFinanceSource()

    with patch("ingestion.yahoo.yf.Ticker", side_effect=RuntimeError("network down")):
        with capture_logs() as logs:
            healthy = asyncio.run(source.healthcheck())

    assert healthy is False
    failures = [e for e in logs if e["event"] == "yahoo.healthcheck_failed"]
    assert len(failures) == 1
    assert failures[0]["error_type"] == "RuntimeError"
    assert failures[0]["log_level"] == "warning"

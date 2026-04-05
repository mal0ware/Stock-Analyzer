"""
Tests for v1 endpoints — verify they still work after v2 integration.
"""


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["version"] == "2.0.0"


def test_glossary(client):
    r = client.get("/api/glossary")
    assert r.status_code == 200
    data = r.json()
    assert "terms" in data
    assert len(data["terms"]) > 0


def test_search_empty(client):
    """Search with empty query should return 422 (FastAPI validation)."""
    r = client.get("/api/search")
    assert r.status_code == 422


def test_invalid_symbol(client):
    r = client.get("/api/quote/!!!INVALID!!!")
    assert r.status_code == 400


def test_invalid_period(client):
    r = client.get("/api/history/AAPL?period=99z")
    assert r.status_code == 400

"""
Tests for v2 endpoints — new intelligence layer.
"""


def test_watchlist_empty(client):
    r = client.get("/api/v1/watchlist")
    assert r.status_code == 200
    data = r.json()
    assert data["symbols"] == []
    assert data["count"] == 0


def test_watchlist_add_remove(client):
    # Add
    r = client.post("/api/v1/watchlist", json={"symbol": "AAPL", "action": "add"})
    assert r.status_code == 200
    assert r.json()["status"] == "added"

    # Verify it's there
    r = client.get("/api/v1/watchlist")
    assert r.json()["count"] == 1
    assert r.json()["symbols"][0]["symbol"] == "AAPL"

    # Duplicate add
    r = client.post("/api/v1/watchlist", json={"symbol": "AAPL", "action": "add"})
    assert r.json()["status"] == "already_exists"

    # Remove
    r = client.post("/api/v1/watchlist", json={"symbol": "AAPL", "action": "remove"})
    assert r.status_code == 200
    assert r.json()["status"] == "removed"

    # Verify empty
    r = client.get("/api/v1/watchlist")
    assert r.json()["count"] == 0


def test_watchlist_invalid_symbol(client):
    r = client.post("/api/v1/watchlist", json={"symbol": "!!!BAD!!!", "action": "add"})
    assert r.status_code == 400


def test_watchlist_invalid_action(client):
    r = client.post("/api/v1/watchlist", json={"symbol": "AAPL", "action": "destroy"})
    assert r.status_code == 400


def test_watchlist_remove_nonexistent(client):
    r = client.post("/api/v1/watchlist", json={"symbol": "XYZ", "action": "remove"})
    assert r.status_code == 404


def test_anomalies_empty(client):
    r = client.get("/api/v1/anomalies")
    assert r.status_code == 200
    data = r.json()
    assert data["anomalies"] == []
    assert data["count"] == 0


def test_snapshot_invalid_symbol(client):
    r = client.get("/api/v1/symbols/!!!BAD!!!/snapshot")
    assert r.status_code == 400


def test_sentiment_invalid_symbol(client):
    r = client.get("/api/v1/symbols/!!!BAD!!!/sentiment")
    assert r.status_code == 400

<p align="center">
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/scikit--learn-F7931E?style=for-the-badge&logo=scikit-learn&logoColor=white" alt="scikit-learn">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/Tauri-24C8D8?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri">
  <img src="https://img.shields.io/badge/C++-00599C?style=for-the-badge&logo=cplusplus&logoColor=white" alt="C++">
  <img src="https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust">
</p>

<h1 align="center">AI Market Analyst</h1>

<p align="center">
  <strong>A real-time market intelligence engine with ML-powered trend classification, anomaly detection, and sentiment analysis — served via REST API, WebSocket streaming, and a React dashboard.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/Languages-5%20(Python%2C%20TS%2C%20C%2B%2B%2C%20Rust%2C%20Java)-orange?style=flat-square" alt="Languages">
  <img src="https://img.shields.io/badge/ML%20Models-3-green?style=flat-square" alt="ML Models">
  <img src="https://img.shields.io/badge/API%20Key-Not%20Required-brightgreen?style=flat-square" alt="No API Key">
</p>

---

## Architecture

```
+-----------------------------------------------------------+
|                     CLIENT LAYER                          |
|  +---------------------+  +----------------------------+ |
|  |  Tauri Desktop App  |  |  Web Browser               | |
|  |  (macOS/Win/Linux)  |  |  (same React UI)           | |
|  |  +---------------+  |  |                            | |
|  |  | React Dashboard|  |  |                            | |
|  |  +-------+-------+  |  +-------------+--------------+ |
|  +----------+----------+                |                 |
|             +------------+--------------+                 |
|                          v                                |
|               REST API (FastAPI) + WebSocket               |
+-----------------------------------------------------------+
|                    SERVICE LAYER                           |
|  +--------------+  +--------------+  +-----------------+  |
|  |  Data        |  |  ML Pipeline |  |  Sentiment      |  |
|  |  Ingestion   |  |  (sklearn)   |  |  Engine (VADER/ |  |
|  |  (yfinance,  |  |  Trend, Anom.|  |  FinBERT)       |  |
|  |  AV, Finnhub)|  +--------------+  +-----------------+  |
|  +--------------+                                         |
+-----------------------------------------------------------+
|                     DATA LAYER                            |
|  +-----------------------------------------------------+ |
|  |  SQLite (local)  OR  PostgreSQL (production)         | |
|  |  Swappable via SQLAlchemy — one config change        | |
|  +-----------------------------------------------------+ |
+-----------------------------------------------------------+
```

---

## Features

| Feature | Description |
|---------|-------------|
| **ML Trend Classification** | Gradient boosted trees classify price action into 5 trend categories with confidence scores |
| **Anomaly Detection** | Isolation Forest flags unusual price/volume activity in real time |
| **Sentiment Analysis** | VADER with 30+ financial terms (FinBERT upgrade path) scores news and social media |
| **Real-Time Streaming** | WebSocket push for live price updates on symbol detail page |
| **Sector Heatmap** | 11-sector overview via ETF proxies with top gainers/losers |
| **Watchlist** | Persistent watchlist with at-a-glance ML signals per symbol |
| **Interactive Charts** | Price + volume charts with 6 time periods (Recharts) |
| **Progressive Caching** | Endpoint-specific TTLs (15s for snapshots, 5min for history) |
| **Multi-Source Ingestion** | Yahoo Finance (no key), Alpha Vantage, Finnhub, NewsAPI, Reddit — all optional |
| **Offline Mode** | 80% of features work with zero API keys |
| **Security Headers** | OWASP-mapped: CSP, X-Frame-Options, rate limiting, strict input validation |
| **Structured Logging** | JSON-formatted logs via structlog for production observability |

---

## Quick Start

### Option A: Python + React (recommended for development)

```bash
# Backend
pip install -r api/requirements.txt
python -m uvicorn main:app --reload --port 8080 --app-dir api

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — the Vite dev server proxies API calls to the backend.

### Option B: Docker

```bash
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080).

### Train the ML Model (optional)

```bash
python -m ml.train_cli
# Trains on 25 large-cap tickers, saves to ml/models/trend_classifier.pkl
# Without training, the trend classifier uses a rule-based fallback
```

---

## API Endpoints

### v1 Endpoints (legacy, preserved)

| Method | Path | Cache TTL | Description |
|--------|------|-----------|-------------|
| `GET` | `/api/health` | — | Health check |
| `GET` | `/api/search?q=` | 300s | Search tickers |
| `GET` | `/api/quote/{symbol}` | 30s | Quote + fundamentals |
| `GET` | `/api/history/{symbol}` | 60–300s | OHLCV price history |
| `GET` | `/api/analysis/{symbol}` | 120s | Technical indicators |
| `GET` | `/api/interpret/{symbol}` | 60s | Plain-English insights |
| `GET` | `/api/news/{symbol}` | 300s | News headlines |
| `GET` | `/api/glossary` | 3600s | Educational glossary |

### v2 Endpoints (ML intelligence layer)

| Method | Path | Cache TTL | Description |
|--------|------|-----------|-------------|
| `GET` | `/api/v1/symbols/{symbol}/snapshot` | 15s | Price + ML signals + sentiment |
| `GET` | `/api/v1/symbols/{symbol}/history` | 60–300s | Structured OHLCV data |
| `GET` | `/api/v1/symbols/{symbol}/sentiment` | 120s | Sentiment timeline |
| `GET` | `/api/v1/anomalies` | 30s | Anomaly feed |
| `GET` | `/api/v1/market/overview` | 60s | Sector heatmap + movers |
| `GET` | `/api/v1/watchlist` | — | User watchlist |
| `POST` | `/api/v1/watchlist` | — | Add/remove symbols |
| `WS` | `/ws/stream/{symbol}` | — | Real-time price push |

Auto-generated docs at `/docs` (Swagger UI).

---

## Project Structure

```
Stock-Analyzer/
├── api/                          # FastAPI backend
│   ├── main.py                   # App entry — v1 + v2 endpoints
│   ├── config.py                 # Centralized config (CORS, TTLs, validation)
│   ├── cache.py                  # In-memory TTL cache
│   ├── validation.py             # Input validation (OWASP A03)
│   ├── middleware.py             # Security headers middleware
│   ├── logging_config.py         # Structured logging (structlog)
│   ├── analysis.py               # Technical analysis engine
│   ├── interpreter.py            # Plain-English insights
│   ├── glossary.py               # Educational glossary
│   ├── db/                       # SQLAlchemy ORM layer
│   │   ├── models.py             # User, Watchlist, PriceData, Sentiment, Anomaly
│   │   └── session.py            # DB session (SQLite ↔ PostgreSQL)
│   ├── ingestion/                # Multi-source data ingestion
│   │   ├── yahoo.py              # Yahoo Finance (zero API keys)
│   │   ├── alphavantage.py       # Alpha Vantage (optional key)
│   │   ├── finnhub.py            # Finnhub (optional key)
│   │   ├── news.py               # NewsAPI (optional key)
│   │   └── reddit.py             # Reddit/PRAW (optional creds)
│   └── routes/                   # v2 API route modules
│       ├── snapshot.py           # /symbols/{symbol}/snapshot
│       ├── history.py            # /symbols/{symbol}/history
│       ├── sentiment.py          # /symbols/{symbol}/sentiment
│       ├── anomalies.py          # /anomalies
│       ├── market.py             # /market/overview
│       ├── watchlist.py          # /watchlist CRUD
│       └── websocket.py          # WebSocket streaming
│
├── ml/                           # ML pipeline
│   ├── features.py               # Feature engineering (RSI, MACD, BB, vol z-score)
│   ├── trend.py                  # Trend classifier (HistGBT + rule-based fallback)
│   ├── anomaly.py                # Anomaly detector (Isolation Forest)
│   ├── sentiment.py              # Sentiment scorer (VADER + FinBERT path)
│   └── train_cli.py              # CLI to train trend model
│
├── frontend/                     # React dashboard (Vite + TypeScript + Tailwind)
│   ├── src/
│   │   ├── pages/                # Overview, SymbolDetail, Watchlist, Anomalies
│   │   ├── components/           # Layout with search + nav
│   │   ├── hooks/                # useWebSocket for real-time streaming
│   │   └── lib/                  # API client + formatting utils
│   └── src-tauri/                # Tauri desktop shell (Rust)
│
├── src/                          # v1 legacy code (C++, Python, Java, Vanilla JS)
├── tests/                        # pytest suite (28 tests)
├── Dockerfile                    # Multi-stage build (Node + Python)
├── docker-compose.yml            # Local Docker setup
├── fly.toml                      # Fly.io deployment
├── railway.json                  # Railway deployment
└── .github/workflows/            # CI/CD
    ├── ci.yml                    # Lint + test + build on every push
    └── build-desktop.yml         # Cross-platform Tauri builds on tag
```

---

## ML Models

| Model | Algorithm | Input | Output |
|-------|-----------|-------|--------|
| **Trend Classifier** | HistGradientBoosting (sklearn) | RSI, MACD, Bollinger width, volume z-score, MA crossover | `strong_uptrend \| uptrend \| sideways \| downtrend \| strong_downtrend` + confidence |
| **Anomaly Detector** | Isolation Forest (sklearn) | Price change %, volume ratio, volatility | Anomaly score (0–1) + boolean flag |
| **Sentiment Scorer** | VADER + financial lexicon (FinBERT optional) | News headlines, Reddit posts | Score (-1 to 1) + label + confidence |

All models run locally. No cloud ML services required.

---

## Zero-Secrets & Offline Mode

| Feature | Online (with API keys) | Offline (zero keys) |
|---------|----------------------|-------------------|
| Price data (yfinance) | Yes | Yes |
| Technical indicators | Yes | Yes |
| Trend classification | Yes | Yes |
| Anomaly detection | Yes | Yes |
| Sentiment (VADER) | Yes | Yes |
| News headlines | NewsAPI/Finnhub | Graceful fallback |
| Reddit sentiment | Reddit API | Graceful fallback |

---

## Security (OWASP Mapping)

| OWASP Risk | Mitigation |
|-----------|-----------|
| **A01: Broken Access Control** | Watchlist scoped to user; JWT path for production |
| **A03: Injection** | Strict regex validation (`^[A-Za-z0-9.\-]{1,10}$`), parameterized SQL via SQLAlchemy |
| **A04: Insecure Design** | Per-IP rate limiting (60/min), HTTP 429 + Retry-After |
| **A05: Misconfiguration** | CORS whitelist, security headers (CSP, X-Frame-Options, etc.) |
| **A06: SSRF** | No user-supplied outbound URLs; data sources hardcoded |
| **A07: XSS** | React JSX escaping, CSP headers |
| **A09: Logging** | Structured JSON logging via structlog |

---

## Desktop App (Tauri)

The Tauri project is scaffolded in `frontend/src-tauri/`. To build desktop installers:

```bash
# Requires Rust toolchain + platform deps
cd frontend
npm run tauri build
```

| Platform | Output |
|----------|--------|
| macOS | `.dmg` + `.app` bundle |
| Windows | `.msi` + `.exe` installer |
| Linux | `.deb` + `.AppImage` |

CI/CD builds all three platforms via GitHub Actions on git tag push.

---

## Data Sources

| Source | API Key Required | Used For |
|--------|-----------------|----------|
| Yahoo Finance (yfinance) | No | Price data, OHLCV, fundamentals, news |
| Alpha Vantage | Optional | Intraday time series, technicals |
| Finnhub | Optional | Company news, real-time quotes |
| NewsAPI | Optional | News headlines for sentiment |
| Reddit (PRAW) | Optional | Social sentiment from r/wallstreetbets, r/stocks |

---

## Disclaimer

> **This tool provides data analysis and is not financial advice.** Past performance does not indicate future results. No buy/sell/hold recommendations. Always do your own research.

---

## License

All rights reserved.

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
  <strong>Real-time market intelligence with ML-powered trend classification, anomaly detection, and sentiment analysis.</strong>
</p>

<p align="center">
  <a href="https://github.com/mal0ware/Stock-Analyzer/releases/latest"><img src="https://img.shields.io/github/v/release/mal0ware/Stock-Analyzer?style=flat-square&color=blue" alt="Latest Release"></a>
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Docker-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/API%20Key-Not%20Required-brightgreen?style=flat-square" alt="No API Key">
</p>

---

## Install

### One Command (Linux / macOS / WSL)

```bash
curl -fsSL https://raw.githubusercontent.com/mal0ware/Stock-Analyzer/main/install.sh | bash
```

Then launch:

```bash
~/ai-market-analyst/launch.sh
```

### Docker (any platform)

```bash
docker run -p 8080:8080 ghcr.io/mal0ware/stock-analyzer:latest
```

Or clone and build:

```bash
git clone https://github.com/mal0ware/Stock-Analyzer.git
cd Stock-Analyzer
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080).

### Desktop App

Download the installer for your platform from the [latest release](https://github.com/mal0ware/Stock-Analyzer/releases/latest):

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | `.dmg` |
| Windows | `.msi` installer |
| Linux | `.deb` / `.AppImage` |

No command line needed — double-click to install and run.

---

## Architecture

```
                    ┌─────────────────────────────────┐
                    │         CLIENT LAYER             │
                    │  ┌───────────┐  ┌────────────┐  │
                    │  │  Desktop  │  │  Browser    │  │
                    │  │  (Tauri)  │  │  (React)    │  │
                    │  └─────┬─────┘  └──────┬─────┘  │
                    └────────┼───────────────┼────────┘
                             └───────┬───────┘
                                     ▼
                    ┌─────────────────────────────────┐
                    │  FastAPI + WebSocket (Python)    │
                    │  Rate limiting · Security hdrs   │
                    │  Structured logging (structlog)  │
                    ├─────────┬──────────┬────────────┤
                    │  Data   │  ML      │  Sentiment │
                    │  Layer  │  Pipeline│  Engine    │
                    │ yfinance│ sklearn  │ VADER/     │
                    │ AV, FH  │ trend,   │ FinBERT    │
                    │ NewsAPI │ anomaly  │            │
                    ├─────────┴──────────┴────────────┤
                    │  SQLite (local) / PostgreSQL     │
                    │  SQLAlchemy ORM — one config     │
                    └─────────────────────────────────┘
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
| **Progressive Caching** | Endpoint-specific TTLs (15s snapshots, 5min history) |
| **Parallel Data Fetching** | Thread pool executor + asyncio for non-blocking I/O |
| **Multi-Source Ingestion** | Yahoo Finance (no key), Alpha Vantage, Finnhub, NewsAPI, Reddit — all optional |
| **Offline Mode** | 80% of features work with zero API keys via yfinance |
| **Security Headers** | OWASP-mapped: CSP, X-Frame-Options, rate limiting, strict input validation |
| **Structured Logging** | JSON-formatted logs via structlog for production observability |
| **Cross-Platform Desktop** | Tauri (Rust + native webview) — ~10MB installers vs Electron's ~150MB |

---

## Tech Stack & Proficiency Demonstration

### Python (FastAPI, scikit-learn, pandas, SQLAlchemy)

The backend is a production-grade **FastAPI** service demonstrating:

- **Async/concurrent architecture** — `asyncio` event loop with `ThreadPoolExecutor` for blocking I/O (yfinance), parallel data fetching across 31 tickers for the market overview endpoint
- **ML pipeline** — Feature engineering (RSI, MACD, Bollinger Bands, volume z-scores), `HistGradientBoosting` trend classifier with rule-based fallback, `IsolationForest` anomaly detector, VADER sentiment with financial lexicon extensions
- **ORM design** — SQLAlchemy declarative models with composite indexes, session dependency injection, SQLite/PostgreSQL swappable via single env var
- **Security** — OWASP A01–A09 mapped: regex input validation, per-IP rate limiting with sliding window, parameterized SQL, CORS whitelist, security headers middleware
- **Structured logging** — `structlog` with JSON/console renderers, context-aware log propagation

### TypeScript / React

The frontend is a **React 19** SPA with **Vite** + **Tailwind CSS v4**:

- **Component architecture** — Route-based code splitting, layout shell with search, reusable signal cards
- **State management** — Local state with hooks (`useState`, `useEffect`, `useCallback`), `Promise.allSettled` for parallel snapshot loading on the watchlist page
- **Real-time data** — Custom `useWebSocket` hook with auto-reconnect, live price updates on symbol detail
- **UX patterns** — Skeleton loading screens (CSS shimmer animation), debounced search with keyboard support, responsive grid layouts, progressive data loading
- **Type safety** — Full TypeScript with strict mode, typed API client layer, interface-first design

### Rust (Tauri)

The desktop app uses **Tauri 2** to wrap the React frontend in a native window:

- **Sidecar pattern** — PyInstaller-bundled Python backend as an external binary, managed by Tauri's shell plugin
- **Cross-compilation** — GitHub Actions matrix builds for macOS (arm64), Windows (x64), Linux (x64) with Rust target caching via `sccache`
- **Security** — CSP headers in Tauri config, restricted IPC permissions

### C++ (v1 Legacy)

The original v1 backend was a **C++17 HTTP server** demonstrating:

- **Systems programming** — Socket-level HTTP server with `<thread>`, `<mutex>`, custom request router
- **Process management** — Subprocess pool (`fork`/`execvp`) for Python analysis workers, with `waitpid` lifecycle management
- **Cross-compilation** — MinGW cross-compilation for Windows from Linux, with `Winsock2` abstraction layer
- **Memory-safe caching** — TTL cache with `std::unordered_map` and mutex-guarded concurrent access

### Docker

Production deployment demonstrates:

- **Multi-stage builds** — Node.js build stage (frontend), Python runtime stage (backend), no Node.js in final image
- **Layer optimization** — Dependencies installed before source code COPY for maximum cache hits
- **Health checks** — Built-in `HEALTHCHECK` instruction, `curl`-based liveness probe
- **Compose** — Single-service compose with named volumes for persistent SQLite data

### Java (v1 Legacy)

The v1 interpreter module was a **Java** natural-language text generator:

- **OOP design** — Strategy pattern for different analysis types, template-based sentence generation
- **JVM interop** — Called from C++ via subprocess, JSON serialization for IPC

### CI/CD (GitHub Actions)

- **Matrix builds** — Parallel cross-platform desktop builds (macOS, Windows, Linux)
- **Dependency caching** — npm, pip, Rust target, Cargo registry caches for fast iteration
- **Automated releases** — Tag-triggered builds with `tauri-action` artifact upload to GitHub Releases

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

Swagger docs at `/docs` when the server is running.

---

## Development

```bash
# Backend
pip install -r api/requirements.txt
python -m uvicorn main:app --reload --port 8080 --app-dir api

# Frontend (separate terminal — hot reload)
cd frontend && npm install && npm run dev
```

### Train ML Model (optional)

```bash
python -m ml.train_cli
```

### Run Tests

```bash
pytest tests/ -v
```

---

## ML Models

| Model | Algorithm | Input | Output |
|-------|-----------|-------|--------|
| **Trend Classifier** | HistGradientBoosting | RSI, MACD, Bollinger width, volume z-score, MA crossover | 5-class trend + confidence |
| **Anomaly Detector** | Isolation Forest | Price change %, volume ratio, volatility | Score (0–1) + flag |
| **Sentiment Scorer** | VADER + financial lexicon | News headlines, Reddit posts | Score (-1 to 1) + label |

All models run locally. No cloud ML services required.

---

## Project Structure

```
Stock-Analyzer/
├── api/                      # FastAPI backend
│   ├── main.py               # App entry — v1 + v2 routes, React SPA serving
│   ├── config.py             # Centralized config (CORS, TTLs, validation)
│   ├── cache.py              # In-memory TTL cache
│   ├── validation.py         # Input validation (OWASP A03)
│   ├── middleware.py          # Security headers middleware
│   ├── logging_config.py     # Structured logging (structlog)
│   ├── db/                   # SQLAlchemy ORM layer
│   ├── ingestion/            # Multi-source data ingestion
│   └── routes/               # v2 API route modules
├── ml/                       # ML pipeline (trend, anomaly, sentiment)
├── frontend/                 # React dashboard (Vite + TS + Tailwind)
│   └── src-tauri/            # Tauri desktop shell (Rust)
├── src/                      # v1 legacy (C++, Python, Java, vanilla JS)
├── tests/                    # pytest suite
├── install.sh                # One-command installer
├── Dockerfile                # Multi-stage production build
├── docker-compose.yml        # Local Docker setup
└── .github/workflows/        # CI/CD (lint, test, build, release)
```

---

## Security (OWASP Mapping)

| OWASP Risk | Mitigation |
|-----------|-----------|
| **A01: Broken Access Control** | Watchlist scoped to user; JWT path for production |
| **A03: Injection** | Strict regex validation, parameterized SQL via SQLAlchemy |
| **A04: Insecure Design** | Per-IP rate limiting (configurable), HTTP 429 + Retry-After |
| **A05: Misconfiguration** | CORS whitelist, security headers (CSP, X-Frame-Options) |
| **A06: SSRF** | No user-supplied outbound URLs; data sources hardcoded |
| **A07: XSS** | React JSX escaping, CSP headers |
| **A09: Logging** | Structured JSON logging via structlog |

---

## Disclaimer

> **This tool provides data analysis and is not financial advice.** Past performance does not indicate future results. No buy/sell/hold recommendations. Always do your own research.

---

## License

All rights reserved.

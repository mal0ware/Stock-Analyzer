<p align="center">
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/scikit--learn-F7931E?style=for-the-badge&logo=scikit-learn&logoColor=white" alt="scikit-learn">
  <img src="https://img.shields.io/badge/Tauri-24C8D8?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri">
  <img src="https://img.shields.io/badge/C++-00599C?style=for-the-badge&logo=cplusplus&logoColor=white" alt="C++">
  <img src="https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
</p>

<h1 align="center">AI Market Analyst</h1>

<p align="center">
  <strong>Real-time market intelligence with ML-powered trend classification, anomaly detection, and sentiment analysis.</strong>
</p>

<p align="center">
  <a href="https://github.com/mal0ware/Stock-Analyzer/releases/latest"><img src="https://img.shields.io/github/v/release/mal0ware/Stock-Analyzer?style=flat-square&color=blue&label=Download" alt="Download"></a>
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/API%20Key-Not%20Required-brightgreen?style=flat-square" alt="No API Key">
</p>

---

## Download

**[Download the latest version](https://github.com/mal0ware/Stock-Analyzer/releases/latest)** for your platform:

| Platform | File | How to install |
|----------|------|----------------|
| **Windows** | `.msi` | Double-click the installer, follow the wizard |
| **macOS** (Apple Silicon) | `.dmg` | Open the file, drag AI Market Analyst to Applications |
| **Linux** | `.deb` or `.AppImage` | Double-click to install, or run `sudo dpkg -i *.deb` |

No setup required. No API keys. The app opens like any other desktop application.

---

## What It Does

AI Market Analyst is a desktop application that tracks stocks and uses machine learning to surface insights that would take a human analyst hours to compute.

| Feature | What you see |
|---------|-------------|
| **Market Overview** | Sector heatmap with real-time prices, top gainers and losers |
| **ML Trend Classification** | Each stock tagged as uptrend/downtrend/sideways with confidence % |
| **Anomaly Detection** | Alerts when a stock's price or volume behaves unusually |
| **Sentiment Analysis** | News headlines scored positive/negative/neutral automatically |
| **Live Price Updates** | Prices update in real-time via WebSocket streaming |
| **Interactive Charts** | Price and volume charts across 6 time periods |
| **Watchlist** | Track your favorite stocks with at-a-glance ML signals |

All data comes from Yahoo Finance — no API keys or accounts needed.

---

## Architecture

```
                    ┌─────────────────────────────────┐
                    │        DESKTOP APP (Tauri)       │
                    │  Native window · ~10MB installer │
                    │  ┌───────────────────────────┐  │
                    │  │     React Dashboard        │  │
                    │  │  Charts · Heatmaps · Live  │  │
                    │  └─────────────┬─────────────┘  │
                    │                │                  │
                    │  ┌─────────────▼─────────────┐  │
                    │  │  FastAPI Backend (sidecar) │  │
                    │  │  Starts automatically      │  │
                    │  │  Rate limiting · Caching   │  │
                    │  ├─────────┬──────┬──────────┤  │
                    │  │  Data   │  ML  │ Sentiment│  │
                    │  │ yfinance│sklearn│ VADER    │  │
                    │  ├─────────┴──────┴──────────┤  │
                    │  │  SQLite (local storage)    │  │
                    │  └───────────────────────────┘  │
                    └─────────────────────────────────┘
```

The app runs entirely on your machine. No cloud services, no accounts, no data leaves your computer.

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
- **State management** — Local state with hooks (`useState`, `useEffect`, `useCallback`), `Promise.allSettled` for parallel snapshot loading
- **Real-time data** — Custom `useWebSocket` hook with auto-reconnect for live price updates
- **UX patterns** — Skeleton loading screens (CSS shimmer animation), debounced search with keyboard support, responsive grid layouts
- **Type safety** — Full TypeScript with strict mode, typed API client layer, interface-first design

### Rust (Tauri 2)

The desktop shell wraps the React frontend in a **native OS window** (~10MB vs Electron's ~150MB):

- **Sidecar pattern** — PyInstaller-bundled Python backend launched as an external process, health-checked before the window appears
- **Cross-compilation** — GitHub Actions matrix builds for macOS (arm64), Windows (x64), Linux (x64)
- **Security** — CSP headers, restricted IPC permissions, no console window in release builds

### C++ (v1 Legacy)

The original v1 backend was a **C++17 HTTP server**:

- **Systems programming** — Socket-level HTTP server with `<thread>`, `<mutex>`, custom request router
- **Process management** — Subprocess pool (`fork`/`execvp`) for Python analysis workers with lifecycle management
- **Cross-compilation** — MinGW cross-compilation for Windows, with `Winsock2` abstraction layer
- **Memory-safe caching** — TTL cache with `std::unordered_map` and mutex-guarded concurrent access

### Docker

Production deployment demonstrates:

- **Multi-stage builds** — Node.js build stage (frontend), Python runtime stage (backend), no Node.js in final image
- **Layer optimization** — Dependencies installed before source COPY for maximum cache hits
- **Health checks** — Built-in `HEALTHCHECK` instruction, `curl`-based liveness probe

### Java (v1 Legacy)

The v1 interpreter module was a **Java** natural-language text generator:

- **OOP design** — Strategy pattern for different analysis types, template-based sentence generation
- **JVM interop** — Called from C++ via subprocess, JSON serialization for IPC

### CI/CD (GitHub Actions)

- **Matrix builds** — Parallel cross-platform desktop builds (macOS, Windows, Linux)
- **Dependency caching** — npm, pip, Rust target caches for fast iteration
- **Automated releases** — Tag-triggered builds produce `.exe`, `.dmg`, `.deb`, `.AppImage` installers uploaded directly to GitHub Releases

---

## For Developers

<details>
<summary>Development setup (click to expand)</summary>

### Run locally

```bash
# Backend
pip install -r api/requirements.txt
python -m uvicorn main:app --reload --port 8080 --app-dir api

# Frontend (separate terminal — hot reload)
cd frontend && npm install && npm run dev
```

### Docker

```bash
docker compose up --build
# Open http://localhost:8080
```

### Train ML Model (optional)

```bash
python -m ml.train_cli
```

### Run Tests

```bash
pytest tests/ -v
```

</details>

---

## API Endpoints

<details>
<summary>Full endpoint reference (click to expand)</summary>

### v1 Endpoints (legacy)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/search?q=` | Search tickers |
| `GET` | `/api/quote/{symbol}` | Quote + fundamentals |
| `GET` | `/api/history/{symbol}` | OHLCV price history |
| `GET` | `/api/analysis/{symbol}` | Technical indicators |
| `GET` | `/api/interpret/{symbol}` | Plain-English insights |
| `GET` | `/api/news/{symbol}` | News headlines |
| `GET` | `/api/glossary` | Educational glossary |

### v2 Endpoints (ML intelligence)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/symbols/{symbol}/snapshot` | Price + ML signals + sentiment |
| `GET` | `/api/v1/symbols/{symbol}/history` | Structured OHLCV data |
| `GET` | `/api/v1/symbols/{symbol}/sentiment` | Sentiment timeline |
| `GET` | `/api/v1/anomalies` | Anomaly feed |
| `GET` | `/api/v1/market/overview` | Sector heatmap + movers |
| `GET` | `/api/v1/watchlist` | User watchlist |
| `POST` | `/api/v1/watchlist` | Add/remove symbols |
| `WS` | `/ws/stream/{symbol}` | Real-time price push |

Swagger docs at `/docs` when the server is running.

</details>

---

## ML Models

| Model | Algorithm | What it does |
|-------|-----------|-------------|
| **Trend Classifier** | Gradient Boosted Trees | Classifies stocks as uptrend/downtrend/sideways with confidence % |
| **Anomaly Detector** | Isolation Forest | Flags unusual price or volume behavior |
| **Sentiment Scorer** | VADER + financial lexicon | Scores news headlines as positive/negative/neutral |

All models run locally on your machine.

---

## Security

| Risk | Protection |
|------|-----------|
| Injection | Strict regex validation, parameterized SQL |
| Rate abuse | Per-IP rate limiting, HTTP 429 |
| Misconfiguration | CORS whitelist, CSP, X-Frame-Options |
| XSS | React JSX escaping, security headers |

---

## Disclaimer

> **This tool provides data analysis and is not financial advice.** Past performance does not indicate future results. Always do your own research.

---

## License

All rights reserved.

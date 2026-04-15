<p align="center">
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/scikit--learn-F7931E?style=for-the-badge&logo=scikit-learn&logoColor=white" alt="scikit-learn">
  <img src="https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
</p>

<h1 align="center">Stock Analyzer</h1>

<p align="center">
  <strong>Desktop stock analysis tool with real-time data, charts, and ML-powered insights.</strong>
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
| **macOS** (Apple Silicon) | `Stock.Analyzer-x.y.z-arm64.dmg` | Open, drag Stock Analyzer to Applications. First launch: right-click → Open (unsigned app). |
| **Windows** | `Stock.Analyzer.Setup.x.y.z.exe` | Double-click the installer. On SmartScreen: "More info" → "Run anyway". |
| **Linux** | `Stock.Analyzer-x.y.z.AppImage` | `chmod +x` the file and double-click. |

No setup required. No API keys. The app opens like any other desktop application.

---

## What It Does

Stock Analyzer is a desktop application that tracks stocks and uses machine learning to surface insights that would take a human analyst hours to compute.

| Feature | What you see |
|---------|-------------|
| **Market Overview** | Sector heatmap with real-time prices, top gainers and losers |
| **Symbol Detail** | 16-stat fundamentals panel, analyst rating gauge, technical indicators, AI-generated insights, news feed |
| **ML Trend Classification** | Each stock tagged as uptrend/downtrend/sideways with confidence % |
| **Anomaly Detection** | Alerts when a stock's price or volume behaves unusually |
| **Sentiment Analysis** | News headlines scored positive/negative/neutral automatically |
| **Forecast Projections** | Dashed target/high/low lines extending from the last close price on the chart |
| **Live Price Updates** | Prices update in real-time via WebSocket streaming |
| **Watchlist** | Track your favorite stocks with at-a-glance ML signals |
| **Learn** | 19-term glossary of market concepts with search and category filters |
| **5 Color Themes** | Dark, Light, Midnight, Ocean, Terminal — persisted across launches |

All data comes from Yahoo Finance — no API keys or accounts needed.

---

## Architecture

```
                    ┌─────────────────────────────────┐
                    │       DESKTOP APP (Electron)     │
                    │  ┌───────────────────────────┐  │
                    │  │    React 19 + Tailwind v4   │  │
                    │  │  Charts · Heatmaps · Themes │  │
                    │  └─────────────┬─────────────┘  │
                    │                │                  │
                    │  ┌─────────────▼─────────────┐  │
                    │  │  FastAPI Backend           │  │
                    │  │  (bundled Python 3.13)     │  │
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

## Tech Stack

### Python (FastAPI, scikit-learn, pandas, SQLAlchemy)

The backend is a production-grade **FastAPI** service demonstrating:

- **Async/concurrent architecture** — `asyncio` event loop with `ThreadPoolExecutor` for blocking I/O (yfinance), parallel data fetching across sectors for the market overview endpoint
- **ML pipeline** — Feature engineering (RSI, MACD, Bollinger Bands, volume z-scores), `HistGradientBoosting` trend classifier with rule-based fallback, `IsolationForest` anomaly detector, VADER sentiment with financial lexicon extensions
- **ORM design** — SQLAlchemy declarative models with composite indexes, session dependency injection, SQLite/PostgreSQL swappable via single env var
- **Security** — Regex input validation, per-IP sliding-window rate limiting, parameterized SQL, CORS whitelist, security headers middleware
- **Structured logging** — `structlog` with JSON/console renderers, context-aware log propagation

### TypeScript / React

The frontend is a **React 19** SPA with **Vite** + **Tailwind CSS v4**:

- **Component architecture** — Route-based code splitting, layout shell with search and theme picker, reusable signal cards
- **State management** — Local state with hooks, `Promise.allSettled` for parallel snapshot loading, `zustand` for shared watchlist state
- **Real-time data** — Custom `useWebSocket` hook with auto-reconnect for live price updates
- **Theming** — 5 palettes driven entirely by CSS custom properties + `[data-theme]` switching, no runtime theme library
- **UX patterns** — Skeleton loading screens, debounced search with keyboard arrow-key navigation and `/` global shortcut
- **Type safety** — Full TypeScript with strict mode, typed API client layer, interface-first design

### Electron

The desktop shell wraps the React frontend in a native OS window and spawns the bundled Python backend as a child process:

- **Bundled runtime** — python-build-standalone CPython 3.13 shipped inside the app (`Contents/Resources/backend/python-env/`), no system Python dependency
- **Single codepath** — One `main.js` handles mac, Windows, and Linux; platform-specific `afterPack` hooks handle binary permissions and environment scrubbing
- **Health check** — App polls `/api/health` before opening the window, so users never see a blank page
- **Clean environment** — Strips `ELECTRON_RUN_AS_NODE`, `VIRTUAL_ENV`, `CONDA_PREFIX`, etc. before spawning Python to prevent import contamination

### CI/CD (GitHub Actions)

- **Matrix builds** — Parallel native-runner builds on `macos-14` (arm64), `windows-latest`, and `ubuntu-22.04`
- **Per-OS Python bundling** — Each runner downloads the appropriate python-build-standalone tarball and installs `api/requirements.txt` into it
- **Automated releases** — Tag-triggered builds produce `.dmg`, `.exe`, and `.AppImage` installers uploaded directly to GitHub Releases

### Docker (server deployment)

For running the backend as a hosted service rather than a desktop app:

- **Multi-stage builds** — Node.js build stage (frontend), Python runtime stage (backend), no Node.js in final image
- **Layer optimization** — Dependencies installed before source COPY for maximum cache hits
- **Health checks** — Built-in `HEALTHCHECK` instruction, `curl`-based liveness probe

---

## For Developers

<details>
<summary>Development setup (click to expand)</summary>

### Run locally (hot reload)

```bash
# Backend
pip install -r api/requirements.txt
python -m uvicorn main:app --reload --port 8080 --app-dir api

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

### Build installers locally

```bash
# macOS arm64 dmg
bash scripts/package-macos.sh

# Windows / Linux — use the GitHub Actions matrix (push a tag)
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

### v1 Endpoints

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

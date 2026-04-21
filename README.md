<p align="center">
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/NumPy-013243?style=for-the-badge&logo=numpy&logoColor=white" alt="NumPy">
  <img src="https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
</p>

<h1 align="center">Stock Analyzer</h1>

<p align="center">
  <strong>Desktop stock analysis tool with real-time streaming, from-scratch ML, and market intelligence.</strong>
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
| **Symbol Detail** | 16-stat fundamentals panel, analyst rating gauge, technical indicators, ML-generated insights, news feed |
| **TradingView Charts** | Candlesticks + volume histogram, draggable price lines, right-click context menu, focus mode |
| **Order Book (Level 2)** | Real top-of-book NBBO from Yahoo, deeper levels synthesized with imbalance gauge |
| **Trading Simulator** | Backtest strategies with market/limit/bracket/options orders, time playback (1x–10x), live P&L, win rate, profit factor |
| **ML Trend Classification** | Each stock tagged as uptrend/downtrend/sideways with confidence % (from-scratch gradient boosting) |
| **Anomaly Detection** | Per-bar IsolationForest scoring with dominant-driver attribution; standalone anomaly scan endpoint |
| **Sentiment Analysis** | News headlines scored positive/negative/neutral automatically |
| **Forecast Projections** | Dashed target/high/low lines extending from the last close price on the chart |
| **Live Price Updates** | Prices, anomaly scores, and trend signals stream via WebSocket |
| **Multi-Tab Symbol View** | Open multiple symbols side-by-side, persisted across launches |
| **Watchlist** | Track your favorite stocks with at-a-glance ML signals |
| **Learn** | 19-term glossary of market concepts with search and category filters |
| **5 Color Themes** | Dark, Light, Midnight, Ocean, Terminal — persisted across launches, live hover preview |

All data comes from Yahoo Finance — no API keys or accounts needed.

---

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │          DESKTOP APP (Electron)          │
                    │  ┌───────────────────────────────────┐  │
                    │  │     React 19 + Tailwind CSS v4     │  │
                    │  │   Charts · Heatmaps · Themes       │  │
                    │  └──────────────┬────────────────────┘  │
                    │       REST      │    WebSocket           │
                    │  ┌──────────────▼────────────────────┐  │
                    │  │     FastAPI Backend                 │  │
                    │  │     (bundled Python 3.13)           │  │
                    │  │     Rate limiting · Caching         │  │
                    │  ├──────────┬──────────┬──────────────┤  │
                    │  │  Event   │  ML      │  Sentiment   │  │
                    │  │  Bus     │  Engine  │  Scorer      │  │
                    │  │  pub/sub │  numpy   │  VADER       │  │
                    │  ├──────────┴──────────┴──────────────┤  │
                    │  │     SQLite (local storage)          │  │
                    │  └───────────────────────────────────┘  │
                    └─────────────────────────────────────────┘
```

The app runs entirely on your machine. No cloud services, no accounts, no data leaves your computer.

---

## ML Engine (From Scratch)

The trend classifier is a **from-scratch gradient boosting implementation** using only NumPy — no scikit-learn, no XGBoost. This was a deliberate engineering choice to demonstrate full understanding of the algorithm, not just library usage.

### How It Works

The classifier uses second-order (Newton) optimization with softmax cross-entropy loss, following the [XGBoost paper](https://arxiv.org/abs/1603.02754):

1. **Feature Engineering** — 8 technical indicators computed from OHLCV data: RSI, MACD histogram, Bollinger Band width, volume z-score, moving average crossover, price momentum (1d/5d), and 20-day volatility.

2. **Decision Trees** — Each tree finds optimal splits by maximizing the gain formula derived from a second-order Taylor expansion of the loss:

   ```
   Gain = 0.5 * [G_L²/(H_L + λ) + G_R²/(H_R + λ) - (G_L + G_R)²/(H_L + H_R + λ)]
   ```

   Leaf values are Newton steps: `w* = -G / (H + λ)`

3. **Boosting Loop** — For K classes, each iteration fits K trees to the gradients (`g = p - y`) and hessians (`h = p(1-p)`) of the cross-entropy loss, then updates predictions with a learning rate.

4. **Training Pipeline** — Stratified 5-fold cross-validation, hyperparameter grid search (27 combinations), class-weight balancing, gain-based and permutation-based feature importance analysis.

### Training Results

Trained on 11,050 samples from 25 large-cap stocks (2-year daily data):

| Metric | Score |
|--------|-------|
| **Accuracy** | 79.7% |
| **Classes** | strong_downtrend, downtrend, sideways, uptrend, strong_uptrend |
| **Top features** | Volume z-score, 20-day volatility, Bollinger width |
| **vs. sklearn** | Within 0.7% accuracy on synthetic benchmarks (see below) |

### Other Models

| Model | Algorithm | What it does |
|-------|-----------|-------------|
| **Trend Classifier** | From-scratch gradient boosted trees | Classifies stocks as uptrend/downtrend/sideways with confidence % |
| **Anomaly Detector** | Isolation Forest | Flags unusual price or volume behavior |
| **Sentiment Scorer** | VADER + financial lexicon | Scores news headlines as positive/negative/neutral |

All models run locally on your machine.

---

## Performance

### Gradient Boosting — custom vs scikit-learn

Measured with `benchmarks/bench_gradient_boosting.py` on 4 000 train / 1 000 test samples, 8 features, 5 classes, 100 trees × depth 4.

| Metric | Custom (NumPy) | scikit-learn `HistGradientBoosting` |
|-------|---------------:|-----------------------------------:|
| Train time | 3.81 s | 0.29 s |
| Accuracy | 73.6 % | 74.3 % |
| Predict latency | 0.042 ms / sample | 0.005 ms / sample |

The custom implementation is ~13× slower to train because sklearn's gradient booster is a carefully optimised C histogram-based algorithm, while ours is pure NumPy on exact splits — a deliberate trade for readability and correctness proofs. Accuracy tracks sklearn within one percent, confirming the XGBoost-style second-order gradient formulation is correct.

### Backend hot-path optimisations

Each of these changes was measured on a representative workload; the baseline is the previous implementation for that code path.

| Change | Approx. speed-up | Why |
|---|---:|---|
| Vectorised `history` endpoint (`to_numpy` + bulk `tolist` vs `iterrows`) | 5–10× | Kills per-row Python overhead |
| Per-symbol `IsolationForest` cache (fit once, score many) | 50–100× on re-scores | Skips repeated model fits |
| Parallel grid search (`multiprocessing.Pool`, CPU-wide) | ~N_cores | Embarrassingly parallel over 27 hyperparameter combos |
| Thread-safe LRU + TTL cache on hot endpoints | 10–20× on cache hits | Avoids redundant yfinance round-trips |

### Frontend

| Change | Effect |
|---|---|
| Zustand single-field selectors in Simulator | Playback tick no longer re-renders unrelated panels |
| `React.memo` on symbol-detail subcards | Re-renders scoped to the props that actually changed |
| Consolidated chart theme via CSS custom properties | One-file change to add a new theme; no TS constant to keep in sync |

---

## Real-Time Streaming

The WebSocket layer uses an **event bus architecture** that decouples data producers from consumers:

- **Shared producers** — If three clients watch AAPL, only one yfinance poller runs. When the last client disconnects, the poller stops.
- **Bounded backpressure** — Each client gets a queue (max 50 events). If a consumer is slow, oldest events are dropped — no memory leaks.
- **ML signals on the stream** — Every tick includes anomaly scores. Trend classification updates push every ~75 seconds.
- **Multi-symbol support** — Subscribe to multiple symbols on a single WebSocket connection via JSON message.

---

## Tech Stack

### Python (FastAPI, NumPy, pandas, SQLAlchemy)

The backend is a production-grade **FastAPI** service:

- **Async/concurrent architecture** — `asyncio` event loop with `ThreadPoolExecutor` for blocking I/O (yfinance), parallel data fetching across sectors for the market overview endpoint
- **From-scratch ML pipeline** — Custom gradient boosting (NumPy only), feature engineering (RSI, MACD, Bollinger Bands, volume z-scores), `IsolationForest` anomaly detector, VADER sentiment with financial lexicon extensions
- **Training rigor** — Stratified K-fold cross-validation, hyperparameter grid search, class-weight balancing, permutation importance, metrics persistence to JSON
- **Event-driven streaming** — Async pub/sub event bus with bounded queues, shared producers, and backpressure handling
- **ORM design** — SQLAlchemy declarative models with composite indexes, session dependency injection, SQLite/PostgreSQL swappable via single env var
- **Security** — Regex input validation, per-IP sliding-window rate limiting, parameterized SQL, CORS whitelist, security headers middleware
- **Structured logging** — `structlog` with JSON/console renderers, context-aware log propagation

### TypeScript / React

The frontend is a **React 19** SPA with **Vite** + **Tailwind CSS v4**:

- **Component architecture** — Route-based code splitting, layout shell with search and theme picker, reusable signal cards
- **State management** — Local state with hooks, `Promise.allSettled` for parallel snapshot loading, `zustand` for shared watchlist state
- **Real-time data** — Custom `useWebSocket` hook with auto-reconnect, handles price + anomaly + trend events
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
- **PR gating** — Every push runs ruff, pytest, frontend type-check, frontend build, and a Docker smoke test before merge

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

### Train ML Model

```bash
# Full training (5-fold CV + grid search over 27 hyperparameter combos)
python -m ml.train_cli

# Quick training (skip grid search, use default hyperparameters)
python -m ml.train_cli --quick

# Custom ticker universe
python -m ml.train_cli AAPL MSFT GOOGL AMZN TSLA
```

Training outputs:
- `ml/models/trend_classifier.pkl` — trained model
- `ml/models/metrics.json` — accuracy, F1 scores, confusion matrix, feature importances, sklearn benchmark

### Run Tests

```bash
pytest tests/ -v
```

### Run Benchmarks

```bash
# Custom gradient boosting vs sklearn
python benchmarks/bench_gradient_boosting.py

# API endpoint latency
python benchmarks/bench_endpoints.py
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
| `GET` | `/api/v1/symbols/{symbol}/history-range` | Custom date-range OHLCV (for simulator backtests) |
| `GET` | `/api/v1/symbols/{symbol}/sentiment` | Sentiment timeline |
| `GET` | `/api/v1/symbols/{symbol}/anomaly-scan` | Per-bar IsolationForest scores with dominant-driver attribution |
| `GET` | `/api/v1/symbols/{symbol}/orderbook` | Level-2 depth (real NBBO + synthesized deeper levels) |
| `GET` | `/api/v1/anomalies` | Anomaly feed |
| `GET` | `/api/v1/market/overview` | Sector heatmap + movers |
| `GET` | `/api/v1/watchlist` | User watchlist |
| `POST` | `/api/v1/watchlist` | Add/remove symbols |
| `WS` | `/ws/stream/{symbol}` | Real-time price + ML signals (single symbol) |
| `WS` | `/ws/stream` | Multi-symbol streaming via JSON subscription |

Swagger docs at `/docs` when the server is running.

</details>

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

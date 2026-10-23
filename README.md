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

> **Maintenance status:** v1.0.0 shipped 2026-04-21. The project is maintained as needed and is not under active development. Last verified 2026-07-19: the backend suite passes (46 passed; the metrics-validation test now runs because the trained model is committed), the frontend suite passes (27 Vitest tests), and the live Yahoo Finance data path (snapshot, history, history-range, market overview) works with `yfinance` 1.4.1.

## Download

**[Download the latest version](https://github.com/mal0ware/Stock-Analyzer/releases/latest)** for your platform:

| Platform | File | How to install |
|----------|------|----------------|
| macOS (Apple Silicon) | `Stock.Analyzer-x.y.z-arm64.dmg` | Open it and drag Stock Analyzer to Applications. The app is unsigned, so on first launch right-click it and choose Open. |
| Windows | `Stock.Analyzer.Setup.x.y.z.exe` | Double-click the installer. If SmartScreen stops it, click "More info", then "Run anyway". |
| Linux | `Stock.Analyzer-x.y.z.AppImage` | Run `chmod +x` on the file, then double-click it. |

There is nothing to set up and no API key to get. The app opens like any other desktop application.

## What it does

Stock Analyzer is a desktop app that tracks stocks and runs machine learning models on them for trend, anomaly, and sentiment signals.

| Feature | What you see |
|---------|-------------|
| Market overview | Sector heatmap with real-time prices, top gainers and losers |
| Symbol detail | 16-stat fundamentals panel, analyst rating gauge, technical indicators, ML-generated insights, news feed |
| TradingView charts | Candlesticks + volume histogram, draggable price lines, right-click context menu, focus mode |
| Order book (Level 2) | Real top-of-book NBBO from Yahoo, with synthesized deeper levels and an imbalance gauge |
| Trading simulator | Backtest strategies with market, limit, bracket, and options orders; time playback from 1x to 10x; live P&L, win rate, and profit factor |
| ML trend classification | Each stock tagged as uptrend/downtrend/sideways with a confidence % (from-scratch gradient boosting) |
| Anomaly detection | Per-bar IsolationForest scoring with dominant-driver attribution, plus a standalone anomaly scan endpoint |
| Sentiment analysis | News headlines scored positive, negative, or neutral |
| Forecast projections | Dashed target/high/low lines extending from the last close price on the chart |
| Live price updates | Prices, anomaly scores, and trend signals stream over WebSocket |
| Multi-tab symbol view | Open several symbols side by side; the tabs persist across launches |
| Watchlist | Track your favorite stocks with their ML signals at a glance |
| Learn | 19-term glossary of market concepts with search and category filters |
| 5 color themes | Dark, Light, Midnight, Ocean, and Terminal, with a live preview on hover; the choice persists across launches |

All data comes from Yahoo Finance, which needs no API key or account.

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

Everything runs on your machine. There are no cloud services or accounts, and no data leaves your computer.

## ML engine (from scratch)

The trend classifier is a gradient boosting implementation written from scratch with only NumPy, without scikit-learn or XGBoost. Writing it by hand was a deliberate choice, meant to show a full understanding of the algorithm.

### How it works

The classifier uses second-order (Newton) optimization with softmax cross-entropy loss, following the [XGBoost paper](https://arxiv.org/abs/1603.02754):

1. Feature engineering computes 8 technical indicators from OHLCV data: RSI, MACD histogram, Bollinger Band width, volume z-score, moving average crossover, price momentum (1d/5d), and 20-day volatility.

2. Each decision tree picks the splits that maximize the gain formula derived from a second-order Taylor expansion of the loss:

   ```
   Gain = 0.5 * [G_L²/(H_L + λ) + G_R²/(H_R + λ) - (G_L + G_R)²/(H_L + H_R + λ)]
   ```

   Leaf values are Newton steps: `w* = -G / (H + λ)`

3. For K classes, each boosting iteration fits K trees to the gradients (`g = p - y`) and hessians (`h = p(1-p)`) of the cross-entropy loss, then updates the predictions with a learning rate.

4. Training uses stratified 5-fold cross-validation, a hyperparameter grid search (27 combinations), class-weight balancing, and both gain-based and permutation-based feature importance analysis.

### Training results

The committed model (`ml/models/trend_classifier.pkl`, retrained 2026-07-19) comes from the full documented pipeline: 11,050 samples from 25 large-cap stocks (2 years of daily data), stratified 5-fold CV over the 27-combination grid, and the best combination (`n_estimators=300, max_depth=8, learning_rate=0.2`) retrained on the full dataset. All numbers below come from `ml/models/metrics.json`.

| Metric | Score | What it means |
|--------|-------|---------------|
| Cross-validated accuracy | **37.9%** | Best mean out-of-fold accuracy over 5 folds. This is the honest estimate of predictive power. Random guessing is 20% (majority class 22.6%), so the signal is real but modest: 10-day trend direction is mostly noise. |
| sklearn hold-out accuracy | 39.3% | `HistGradientBoosting` on the same data and split. The from-scratch implementation tracks the reference library. |
| In-sample training accuracy | 100.0% | At 300 trees × depth 8 the ensemble memorizes its training set. It is listed for transparency only and says nothing about predictive power. |
| Classes | 5 | strong_downtrend, downtrend, sideways, uptrend, strong_uptrend |

By permutation importance, the top features are 20-day volatility, Bollinger width, and the 10/50 MA crossover.

For any real predictive claim, these numbers would be replaced by the planned walk-forward evaluation (train strictly on the past, score strictly on the future; see `docs/REVAMP_PLAN.md`).

### Other models

| Model | Algorithm | What it does |
|-------|-----------|-------------|
| Trend classifier | From-scratch gradient boosted trees | Classifies stocks as uptrend/downtrend/sideways with confidence % |
| Anomaly detector | Isolation Forest | Flags unusual price or volume behavior |
| Sentiment scorer | VADER + financial lexicon | Scores news headlines as positive/negative/neutral |

### Where the trained model lives (and what ships)

`python -m ml.train_cli` writes the trained model to `ml/models/trend_classifier.pkl` (plus `metrics.json`), and both files are committed to this repository as a versioned artifact. The pickle is about 21 MB and is stored without Git LFS. Because the model is in the repo, every build is reproducible: releases package the exact model that CI validated, and nothing is trained over the network at build time.

How each build target picks it up:

- Release installers include the trained model. electron-builder copies the whole `ml/` tree into the app bundle (the `extraResources` entry maps it to `backend/api/ml` in `src/electron/package.json`). The `Build Desktop Apps` workflow (`.github/workflows/build-desktop.yml`) fails fast if the model is missing, and before packaging it smoke-tests the model with the *bundled* Python interpreter (`scripts/verify_model.py`), so a release can't silently ship the rule-based heuristic. Snapshot responses from a shipped app report `"method": "ml_model"`.
- Dev checkouts and the Docker image get the committed model automatically (`COPY ml/ ./ml/` in the Dockerfile). You can retrain any time with `python -m ml.train_cli` (see `ml/TRAINING.md`); the new artifact replaces the committed one.
- CI runs `scripts/verify_model.py` on every push to main and every pull request, so a refactor that breaks unpickling (e.g. renaming `GradientBoostingClassifier`) fails CI instead of degrading shipped apps to the fallback.

The rule-based heuristic (`TrendClassifier._rule_based_fallback`) is still there as a fallback, and responses that use it are labelled `"method": "rule_based"`. No supported build ships without the trained model. The v1.0.0 installers predate this change, though, and do fall back to the heuristic.

## Performance

### Gradient boosting: custom vs scikit-learn

Measured with `benchmarks/bench_gradient_boosting.py` on 4 000 train / 1 000 test samples, 8 features, 5 classes, 100 trees × depth 4.

| Metric | Custom (NumPy) | scikit-learn `HistGradientBoosting` |
|-------|---------------:|-----------------------------------:|
| Train time | 3.81 s | 0.29 s |
| Accuracy | 73.6 % | 74.3 % |
| Predict latency | 0.042 ms / sample | 0.005 ms / sample |

The custom implementation is ~13× slower to train because sklearn's gradient booster is a carefully optimised, histogram-based C implementation, while this one is pure NumPy on exact splits. That is a deliberate trade for readability and correctness proofs. Accuracy stays within one percent of sklearn, which is a good sign that the XGBoost-style second-order gradient formulation is correct.

### Backend hot-path optimisations

Each change was measured on a representative workload against the previous implementation of that code path.

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

## Real-time streaming

The WebSocket layer is built on an event bus that decouples data producers from consumers.

- If three clients watch AAPL, they share one yfinance poller, which stops when the last client disconnects.
- Each client gets a bounded queue of at most 50 events. When a consumer falls behind, the oldest events are dropped, so a slow client can't grow memory without limit.
- Every tick includes anomaly scores, and trend classification updates are pushed about every 75 seconds.
- One WebSocket connection can subscribe to several symbols with a JSON message.

## Tech stack

### Python (FastAPI, NumPy, pandas, SQLAlchemy)

The backend is a FastAPI service:

- An `asyncio` event loop with a `ThreadPoolExecutor` for blocking I/O (yfinance), and parallel data fetching across sectors for the market overview endpoint
- Custom gradient boosting (NumPy only), feature engineering (RSI, MACD, Bollinger Bands, volume z-scores), an `IsolationForest` anomaly detector, and VADER sentiment with financial lexicon extensions
- Model training with stratified K-fold cross-validation, hyperparameter grid search, class-weight balancing, and permutation importance, with metrics saved to JSON
- An async pub/sub event bus with bounded queues, shared producers, and backpressure handling
- SQLAlchemy declarative models with composite indexes and session dependency injection; SQLite and PostgreSQL can be swapped with a single env var
- Regex input validation, per-IP sliding-window rate limiting, parameterized SQL, a CORS whitelist, and security-header middleware
- Structured logging with `structlog` (JSON or console renderers) and context-aware log propagation

### TypeScript / React

The frontend is a React 19 single-page app built with Vite and Tailwind CSS v4:

- Route-based code splitting, a layout shell with search and the theme picker, and reusable signal cards
- Local state in hooks, `Promise.allSettled` for loading snapshots in parallel, and `zustand` stores for the simulator and the open symbol tabs
- A custom `useWebSocket` hook that reconnects automatically and handles price, anomaly, and trend events
- 5 palettes driven entirely by CSS custom properties and `[data-theme]` switching, with no runtime theme library
- Skeleton loading screens, and debounced search with arrow-key navigation and a global `/` shortcut
- TypeScript in strict mode throughout, a typed API client layer, and interface-first design

### Electron

The desktop shell wraps the React frontend in a native OS window and spawns the bundled Python backend as a child process:

- The app ships its own python-build-standalone CPython 3.13 (`Contents/Resources/backend/python-env/`), so it doesn't depend on a system Python
- One `main.js` handles macOS, Windows, and Linux, and the `afterPack` hook sets execute permissions on the bundled Python binaries in Linux builds
- The app polls `/api/health` before opening the window, so users never see a blank page
- Before spawning Python, the app strips `ELECTRON_RUN_AS_NODE`, `VIRTUAL_ENV`, `CONDA_PREFIX`, and similar variables so packages from another Python environment can't leak into the backend's imports

### CI/CD (GitHub Actions)

- Desktop builds run in parallel on native runners: `macos-14` (arm64), `windows-latest`, and `ubuntu-22.04`
- Each runner downloads the matching python-build-standalone tarball and installs `api/requirements.txt` into it
- Pushing a version tag builds the `.dmg`, `.exe`, and `.AppImage` installers and uploads them straight to GitHub Releases
- Pushes to main and pull requests run ruff, pytest, a frontend type-check, a frontend build, and a Docker smoke test before merge

### Docker (server deployment)

The Docker image runs the backend as a hosted service instead of a desktop app:

- A Node.js stage builds the frontend and a Python runtime stage runs the backend, so the final image has no Node.js in it
- Dependencies are installed before the source is copied in, to get the most cache hits
- A built-in `HEALTHCHECK` instruction runs a `curl`-based liveness probe

## For developers

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

### Train ML model

```bash
# Full training (5-fold CV + grid search over 27 hyperparameter combos)
python -m ml.train_cli

# Quick training (skip grid search, use default hyperparameters)
python -m ml.train_cli --quick

# Custom ticker universe
python -m ml.train_cli AAPL MSFT GOOGL AMZN TSLA
```

Training outputs:
- `ml/models/trend_classifier.pkl`: the trained model
- `ml/models/metrics.json`: accuracy, F1 scores, confusion matrix, feature importances, sklearn benchmark

### Run tests

```bash
pytest tests/ -v
```

### Run benchmarks

```bash
# Custom gradient boosting vs sklearn
python benchmarks/bench_gradient_boosting.py

# API endpoint latency
python benchmarks/bench_endpoints.py
```

</details>

## API endpoints

<details>
<summary>Full endpoint reference (click to expand)</summary>

### v1 endpoints

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

### v2 endpoints (ML intelligence)

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

Swagger docs are served at `/docs` while the server is running.

</details>

## Security

| Risk | Protection |
|------|-----------|
| Injection | Strict regex validation, parameterized SQL |
| Rate abuse | Per-IP rate limiting, HTTP 429 |
| Misconfiguration | CORS whitelist, CSP, X-Frame-Options |
| XSS | React JSX escaping, security headers |

## Disclaimer

> **This tool provides data analysis and is not financial advice.** Past performance does not indicate future results. Always do your own research.

## License

This project is licensed under the [MIT License](LICENSE).

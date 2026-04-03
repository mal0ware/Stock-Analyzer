<p align="center">
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron">
</p>

<h1 align="center">Stock Analyzer</h1>

<p align="center">
  <strong>A multi-language desktop stock analysis tool with real-time data, interactive charts, AI-generated insights, and analyst ratings.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20WSL2-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/License-All%20Rights%20Reserved-red?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/Data-Yahoo%20Finance-purple?style=flat-square" alt="Data Source">
  <img src="https://img.shields.io/badge/API%20Key-Not%20Required-brightgreen?style=flat-square" alt="No API Key">
</p>

---

## Download

### macOS (Apple Silicon)

<p>
  <a href="https://github.com/mal0ware/Stock-Analyzer/releases/latest/download/StockAnalyzer-macOS-arm64.dmg">
    <img src="https://img.shields.io/badge/Download-macOS%20DMG-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download macOS DMG">
  </a>
</p>

1. Click the button above to download the latest `.dmg`
2. Open the `.dmg` and drag **Stock Analyzer** into **Applications**
3. First launch: right-click the app > **Open** > click **Open** in the Gatekeeper dialog

> The app is not yet code-signed. macOS Gatekeeper will block double-click on first launch. Right-click > Open bypasses this once.

#### Updating to a New Version

When a new version is released, the download button above always points to the latest release. To update:

1. Download the new `.dmg` using the button above
2. Open it and drag **Stock Analyzer** to **Applications**
3. Click **Replace** when prompted — your old version will be overwritten with the new one

There is no auto-updater. You must download and reinstall the `.dmg` each time a new version is released.

### Linux / WSL2

There is no prebuilt download for Linux yet. See [Build from Source](#development) below.

### Build from Source

See [Development](#development) below.

---

## Features

| Feature | Description |
|---------|-------------|
| **Live Stock Data** | Real-time prices, daily change, and 16 key statistics from Yahoo Finance |
| **Interactive Charts** | Price and volume charts with 6 time ranges (1D to 5Y) and analyst forecast projections |
| **Analyst Ratings** | Semicircle gauge showing buy/sell consensus with detailed reasoning |
| **Technical Analysis** | RSI, MACD, SMA, trend detection, support/resistance with visual gauge |
| **AI Overview** | Auto-generated stock summary with profit strategy recommendations |
| **Plain-English Insights** | Java-powered explanations of what the numbers actually mean |
| **5 Color Themes** | Dark, Light, Midnight, Ocean, Terminal with persistence across sessions |
| **Search** | Find any stock by ticker symbol or company name with auto-suggestions |
| **News Feed** | Recent headlines with publisher, timestamps, and thumbnails |
| **Learn Section** | 19 stock market terms explained with categories and filters |

> **No API keys. No accounts. No subscriptions. Everything runs locally.**

---

## Architecture

The app has two deployment modes:

### Cloud / Docker (recommended for scaling)

```
    Browser / Any device              Cloud (Railway, Fly.io, AWS)
    +-------------------+            +---------------------------+
    |  Frontend          | -- HTTPS ->|  FastAPI Backend (Python)  |
    |  HTML/CSS/JS       |            |  Stock data (yfinance)     |
    |  Chart.js, Themes  |            |  Technical analysis        |
    |                    |            |  Interpretation engine      |
    +-------------------+            |  News, Glossary             |
                                     +---------------------------+
                                              Docker container
```

### Desktop (macOS DMG)

```
    Electron Window
    +-------------------+
    |  Frontend          |
    |  HTML/CSS/JS       |-----> C++ Backend (localhost:8089)
    +-------------------+         |-- Python (yfinance)
                                  |-- Java (interpreter)
                                  |-- Technical analysis (C++)
```

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Cloud API** | FastAPI (Python) | Single service: data, analysis, insights, news, glossary |
| **Desktop Backend** | C++ + Python + Java | Legacy multi-language backend for offline use |
| **Frontend** | HTML/CSS/JS + Chart.js | 5 themes, responsive charts, search |
| **Desktop Shell** | Electron | macOS/Linux desktop wrapper |
| **Deployment** | Docker | One command to deploy anywhere |

---

## API

The backend runs on `localhost:8089`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/search?q=apple` | Search tickers by name or symbol |
| `GET` | `/api/quote/:symbol` | Current price, stats, company info |
| `GET` | `/api/history/:symbol?period=1mo` | Historical OHLCV data |
| `GET` | `/api/analysis/:symbol?period=1y` | Technical indicators (SMA, EMA, RSI, MACD) |
| `GET` | `/api/interpret/:symbol` | Plain-English analysis (Java) |
| `GET` | `/api/news/:symbol` | Recent news headlines |
| `GET` | `/api/glossary` | Stock term definitions |

---

## Development

### Option A: Cloud/Docker (recommended)

Requires only Python 3.13+ (or Docker).

```bash
# Run locally with Python
cd api
pip install -r requirements.txt
uvicorn main:app --reload --port 8080

# Or run with Docker
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

### Option B: Desktop (Electron + C++ backend)

Requires C++ compiler, Python 3, Java 21, Node.js.

```bash
bash scripts/setup.sh    # Install dependencies
bash scripts/run.sh      # Launch desktop app
```

### Build & Package

```bash
# Cloud: Docker image
docker build -t stock-analyzer .

# Desktop: macOS DMG
bash scripts/package-macos.sh

# Desktop: Linux AppImage
bash scripts/package.sh

# C++ only
make              # Compile backend
make java         # Compile Java classes
make clean        # Remove artifacts
```

### Deploy to Cloud

```bash
# Railway (recommended — easiest)
railway up

# Fly.io
fly launch
fly deploy

# Any Docker host
docker compose up -d
```

---

## Project Structure

```
Stock-Analyzer/
├── api/                      # Cloud backend (FastAPI)
│   ├── main.py               # FastAPI app — all endpoints
│   ├── analysis.py           # Technical analysis (SMA, EMA, RSI, MACD)
│   ├── interpreter.py        # Plain-English stock insights
│   ├── glossary.py           # Educational glossary (19 terms)
│   └── requirements.txt      # Python dependencies
│
├── src/
│   ├── frontend/             # UI (shared by cloud + desktop)
│   │   ├── index.html        # Home page with search
│   │   ├── stock.html        # Stock detail page
│   │   ├── learn.html        # Educational glossary page
│   │   ├── css/styles.css    # 5 themes, responsive layout
│   │   └── js/               # Client-side logic
│   │
│   ├── cpp/                  # Desktop backend (C++)
│   ├── python/               # Desktop data layer
│   ├── java/src/analyzer/    # Desktop analysis layer
│   └── electron/             # Desktop shell
│
├── Dockerfile                # Cloud container
├── docker-compose.yml        # Local Docker setup
├── fly.toml                  # Fly.io deployment config
├── railway.json              # Railway deployment config
├── Makefile                  # C++ build (desktop only)
└── scripts/                  # Build & packaging scripts
```

---

## Security

This application follows [OWASP](https://owasp.org/www-project-top-ten/) best practices:

| Protection | Implementation |
|------------|---------------|
| **Command Injection Prevention** | All subprocess calls use `fork`/`execvp` with argument arrays — no shell interpretation |
| **Input Validation** | Strict regex whitelisting on all parameters at C++ and Python layers |
| **Rate Limiting** | 60 requests/minute per IP with HTTP 429 and `Retry-After` headers |
| **XSS Prevention** | All user-facing data escaped; DOM methods used instead of innerHTML |
| **Security Headers** | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| **CORS Restriction** | Locked to `localhost:8089` — no wildcard origins |
| **URL Validation** | External links restricted to `https://` only |
| **No Secrets** | Zero API keys, tokens, or credentials in the codebase |

---

## Contributing

Contributions are welcome! Here's how to get started.

> **All commands below work on macOS, Linux, and WSL2.**

### 1. Fork & Clone

```bash
# Fork the repo on GitHub (click the "Fork" button), then:
git clone https://github.com/<your-username>/Stock-Analyzer.git
cd Stock-Analyzer
```

### 2. Create a Branch

Always work on a new branch — never commit directly to `main`.

```bash
# Create and switch to a new branch
git checkout -b feature/your-feature-name
```

#### Branch Naming Conventions

| Prefix | Use for | Example |
|--------|---------|---------|
| `feature/` | New functionality | `feature/watchlist-page` |
| `fix/` | Bug fixes | `fix/rsi-calculation-error` |
| `docs/` | Documentation changes | `docs/add-api-examples` |
| `refactor/` | Code cleanup (no behavior change) | `refactor/split-analysis-module` |

### 3. Make & Test Your Changes

```bash
# Run the app locally to test
bash scripts/setup.sh        # First time only — installs dependencies
bash scripts/run.sh           # Launch the desktop app

# Verify the C++ backend compiles cleanly
make clean && make
```

### 4. Commit Your Changes

```bash
# See what you changed
git status
git diff

# Stage specific files (don't use "git add .")
git add src/frontend/js/app.js src/frontend/css/styles.css

# Commit with a clear message
git commit -m "Add volume overlay toggle to chart view"
```

### 5. Push & Open a Pull Request

```bash
# Push your branch to your fork
git push origin feature/your-feature-name
```

Then on GitHub:

1. Go to the [original repo](https://github.com/mal0ware/Stock-Analyzer)
2. Click **"Compare & pull request"** (appears automatically after a push)
3. Set the base branch to `main`
4. Write a short description of what your PR does and why
5. Click **"Create pull request"**

### Guidelines

- Keep PRs focused — one feature or fix per PR
- Test your changes locally before pushing
- Make sure the C++ backend compiles cleanly (`make clean && make`)
- Follow the existing code style

---

## Releasing a New Version

> **For maintainers only.** This section explains how to package and publish a new release.

### Step 1: Build the Installer

<details>
<summary><strong>macOS (Apple Silicon)</strong></summary>

```bash
bash scripts/package-macos.sh
```

This produces a `.dmg` in the `dist/` folder. The build takes a few minutes — it bundles Python, Java, the C++ backend, and Electron into a single installer.

</details>

<details>
<summary><strong>Linux / WSL2</strong></summary>

```bash
bash scripts/package.sh
```

This produces a standalone app directory in `dist/`.

</details>

### Step 2: Create a GitHub Release

Make sure you have the [GitHub CLI](https://cli.github.com/) installed and authenticated (`gh auth login`).

```bash
# Copy the DMG with the release-friendly name
cp "dist/Stock Analyzer-<version>-arm64.dmg" dist/StockAnalyzer-macOS-arm64.dmg

# Create the release (replace version number)
gh release create v1.x.x \
  --title "Stock Analyzer v1.x.x" \
  --notes "Description of what changed in this release" \
  ./dist/StockAnalyzer-macOS-arm64.dmg
```

> **Important:** The asset must be named `StockAnalyzer-macOS-arm64.dmg` so the download button in this README works. The `/releases/latest/download/` URL always points to the newest release automatically — no README changes needed.

### Step 3: Verify

1. Check the release page: `https://github.com/mal0ware/Stock-Analyzer/releases/latest`
2. Click the download badge at the top of this README and confirm it downloads the new version

---

## Troubleshooting

<details>
<summary><strong>macOS: "App is damaged" or Gatekeeper blocks it</strong></summary>

The app is not code-signed. Right-click > **Open** on first launch, or run:
```bash
xattr -cr /Applications/StockAnalyzer.app
```

</details>

<details>
<summary><strong>macOS: "Install Command Line Tools" popup during setup</strong></summary>

Click **Install**, wait for it to finish, then run `bash scripts/setup.sh` again.

</details>

<details>
<summary><strong>"python3 not found" during setup</strong></summary>

Download from [python.org/downloads](https://www.python.org/downloads/) and follow the installer steps.

</details>

<details>
<summary><strong>No window opens / Electron not found</strong></summary>

The app falls back to browser mode. Open [http://localhost:8089](http://localhost:8089) in any browser.

</details>

<details>
<summary><strong>Something else is broken</strong></summary>

Re-run setup:
```bash
bash scripts/setup.sh
```

</details>

---

## Data Source

All market data comes from [Yahoo Finance](https://finance.yahoo.com) via the [yfinance](https://github.com/ranaroussi/yfinance) Python library. Free, no API key, no account required.

---

## Disclaimer

> **For educational and informational purposes only.** This application does not provide financial advice. All analysis is generated from publicly available data and should not be used as the sole basis for investment decisions. Always do your own research or consult a financial advisor.

---

## License

All rights reserved.

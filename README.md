<p align="center">
  <img src="https://img.shields.io/badge/C++-00599C?style=for-the-badge&logo=cplusplus&logoColor=white" alt="C++">
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/Java-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white" alt="Java">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron">
</p>

<h1 align="center">Stock Analyzer</h1>

<p align="center">
  <strong>A multi-language desktop stock analysis tool with real-time data, interactive charts, AI-generated insights, and analyst ratings — all running locally on your machine.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20WSL2-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/License-All%20Rights%20Reserved-red?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/Data-Yahoo%20Finance-purple?style=flat-square" alt="Data Source">
  <img src="https://img.shields.io/badge/API%20Key-Not%20Required-brightgreen?style=flat-square" alt="No API Key">
</p>

---

## Features

| Feature | Description |
|---------|-------------|
| **Live Stock Data** | Real-time prices, daily change, and 16 key statistics from Yahoo Finance |
| **Interactive Charts** | Price and volume charts with 6 time ranges (1D to 5Y) and analyst forecast projections |
| **Analyst Ratings** | Semicircle gauge showing buy/sell consensus with detailed reasoning |
| **Technical Analysis** | RSI, MACD, SMA, trend detection, support/resistance — with visual gauge |
| **AI Overview** | Auto-generated stock summary with profit strategy recommendations |
| **Plain-English Insights** | Java-powered explanations of what the numbers actually mean |
| **5 Color Themes** | Dark, Light, Midnight, Ocean, Terminal — persistent across sessions |
| **Search** | Find any stock by ticker symbol or company name with auto-suggestions |
| **News Feed** | Recent headlines with publisher, timestamps, and thumbnails |
| **Learn Section** | 19 stock market terms explained simply with categories and filters |

> **No API keys. No accounts. No subscriptions. Everything runs locally and is completely free.**

---

## Quick Start

### 1. Install

```bash
git clone https://github.com/mal0ware/Stock-Analyzer.git
cd Stock-Analyzer
bash scripts/setup.sh
```

### 2. Run

```bash
./scripts/run.sh
```

That's it. The app opens in its own window.

---

## Platform Setup

<details>
<summary><strong>macOS</strong></summary>

1. Open **Terminal** (`Cmd + Space` > type "Terminal" > Enter)
2. Install [Homebrew](https://brew.sh) if you don't have it:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
3. Clone and set up:
   ```bash
   git clone https://github.com/mal0ware/Stock-Analyzer.git
   cd Stock-Analyzer
   bash scripts/setup.sh
   ```
4. If a popup asks to install **Command Line Tools**, click **Install**, wait for it to finish, then run `bash scripts/setup.sh` again.

</details>

<details>
<summary><strong>Linux (Ubuntu, Debian, Fedora, Arch)</strong></summary>

```bash
git clone https://github.com/mal0ware/Stock-Analyzer.git
cd Stock-Analyzer
bash scripts/setup.sh
```

</details>

<details>
<summary><strong>Windows (via WSL2)</strong></summary>

1. Open **Ubuntu** from the Start menu (or your WSL terminal)
2. Run:
   ```bash
   git clone https://github.com/mal0ware/Stock-Analyzer.git
   cd Stock-Analyzer
   bash scripts/setup.sh
   ```
3. The app launches as a native Windows window using Edge in app mode.

</details>

### What the setup installs automatically

| Dependency | Purpose | How it's installed |
|------------|---------|-------------------|
| C++ compiler | Backend server | Xcode tools (Mac) / apt (Linux) |
| Python 3 + yfinance | Stock data from Yahoo Finance | System package manager or python.org |
| Java 21 (JDK) | Plain-English analysis engine | Auto-downloaded to `~/.local/jdk/` |
| Node.js + Electron | Desktop application window | Auto-downloaded or Homebrew |

---

## How to Use

### Searching for a Stock
1. Type a **ticker symbol** (AAPL, TSLA) or **company name** (Apple, Tesla) in the search bar
2. Press Enter or click a result
3. The stock detail page loads with all data

### Reading the Stock Page
- **Header** — Company name, ticker, current price, daily change
- **Description** — What the company does (expandable)
- **Chart** — Interactive price chart with volume bars and analyst forecast lines
- **Analyst Rating** — Gauge showing consensus + reasons why analysts feel that way
- **Technical Rating** — Gauge showing momentum and trend indicators
- **AI Overview** — Generated summary with strategy recommendations
- **Key Statistics** — 16 metrics in a clean list layout
- **Analysis** — Plain-English paragraphs explaining what the data means
- **News** — Recent headlines with thumbnails and timestamps

### Quick Access
Click any popular stock chip on the home page (AAPL, GOOGL, MSFT, TSLA, AMZN, NVDA, META, JPM).

### Themes
Click the palette icon in the top-right to switch between 5 color themes. Your choice is saved automatically.

---

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │     Desktop Window (Electron)        │
                    │     WSL2: Edge --app mode            │
                    └────────────────┬────────────────────┘
                                     │
                    ┌────────────────▼────────────────────┐
                    │     Frontend (HTML / CSS / JS)       │
                    │     Chart.js  ·  5 Themes  ·  Search │
                    └────────────────┬────────────────────┘
                                     │ localhost:8089
                    ┌────────────────▼────────────────────┐
                    │     C++ Backend Server               │
                    │     REST API  ·  Analysis Engine     │
                    │     Rate Limiter  ·  TTL Cache       │
                    └──────┬─────────────────┬────────────┘
                           │                 │
              ┌────────────▼───┐    ┌────────▼───────────┐
              │    Python      │    │       Java          │
              │    yfinance    │    │   Interpretation    │
              │    Stock data  │    │   Plain-English     │
              │    News feed   │    │   analysis engine   │
              └────────────────┘    └────────────────────┘
```

### Why Five Languages?

| Language | Role | Why |
|----------|------|-----|
| **C++** | Backend server + analysis engine | Millisecond-fast technical analysis (SMA, EMA, RSI, MACD) |
| **Python** | Data fetching | yfinance is the best free, no-key stock data source |
| **Java** | Text generation | Produces readable multi-paragraph stock explanations |
| **JavaScript** | Frontend interactivity | Charts, search, themes, dynamic UI |
| **HTML/CSS** | Layout and styling | 5 themes, responsive design, gauge visualizations |

---

## Security

This application follows [OWASP](https://owasp.org/www-project-top-ten/) best practices:

| Protection | Implementation |
|------------|---------------|
| **Command Injection Prevention** | All subprocess calls use `execvp` with argument arrays — no shell interpretation |
| **Input Validation** | Strict whitelisting on all parameters (ticker symbols, periods, search queries) at both C++ and Python layers |
| **Rate Limiting** | 60 requests/minute per IP with HTTP 429 responses and `Retry-After` headers |
| **XSS Prevention** | All user-facing data is escaped; search results use DOM methods instead of innerHTML |
| **Security Headers** | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy on every response |
| **CORS Restriction** | Locked to `localhost:8089` — no wildcard origins |
| **URL Validation** | News links and thumbnails restricted to `https://` only |
| **No Secrets** | Zero API keys, tokens, or credentials anywhere in the codebase |

---

## API Endpoints

The C++ server runs on `localhost:8089`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/search?q=apple` | Search tickers by name or symbol |
| `GET` | `/api/quote/:symbol` | Current price, stats, company info |
| `GET` | `/api/history/:symbol?period=1mo` | Historical OHLCV data |
| `GET` | `/api/analysis/:symbol?period=1y` | Technical indicators (SMA, EMA, RSI, MACD) |
| `GET` | `/api/interpret/:symbol` | Plain-English analysis (Java) |
| `GET` | `/api/news/:symbol` | Recent news headlines |
| `GET` | `/api/glossary` | 19 stock term definitions |

---

## Project Structure

```
Stock-Analyzer/
├── scripts/
│   ├── setup.sh              # One-time setup — installs everything
│   ├── run.sh                # Launch the application
│   └── package.sh            # Package into standalone distributable
│
├── src/
│   ├── cpp/                  # C++ backend
│   │   ├── main.cpp          # Entry point — starts HTTP server
│   │   ├── server.cpp        # REST API routes, rate limiting, validation
│   │   ├── analysis.cpp      # Technical analysis engine
│   │   ├── subprocess.cpp    # Safe subprocess execution (execvp)
│   │   └── cache.cpp         # Thread-safe TTL cache
│   │
│   ├── python/               # Data layer
│   │   ├── data_fetcher.py   # Stock quotes, history, search (yfinance)
│   │   └── news_fetcher.py   # News headlines
│   │
│   ├── java/                 # Analysis layer
│   │   └── src/analyzer/
│   │       ├── Interpreter.java   # 8-category stock analysis
│   │       └── Glossary.java      # 19-term educational glossary
│   │
│   ├── electron/             # Desktop shell
│   │   ├── main.js           # Electron entry point
│   │   └── package.json
│   │
│   └── frontend/             # UI
│       ├── index.html        # Home page with search
│       ├── stock.html        # Stock detail page
│       ├── learn.html        # Educational glossary
│       ├── css/styles.css    # 5 themes, responsive layout
│       └── js/
│           ├── stock.js      # Stock page logic, gauges, AI overview
│           ├── chart_render.js   # Chart.js charts + forecast
│           ├── search.js     # Search with auto-suggestions
│           ├── theme.js      # Theme switching + persistence
│           ├── app.js        # Home page logic
│           └── learn.js      # Glossary filtering
│
├── lib/                      # Third-party C++ headers
│   ├── httplib.h             # cpp-httplib (HTTP server)
│   └── json.hpp              # nlohmann/json (JSON parsing)
│
├── build/                    # Build output (gitignored)
└── Makefile                  # Build configuration
```

---

## Troubleshooting

<details>
<summary><strong>"command not found" when running setup</strong></summary>

Make sure you're inside the project folder:
```bash
cd Stock-Analyzer
```

</details>

<details>
<summary><strong>Mac: "Install Command Line Tools" popup</strong></summary>

Click **Install**, wait for it to finish (a few minutes), then run `bash scripts/setup.sh` again.

</details>

<details>
<summary><strong>Mac: "python3 not found"</strong></summary>

Download from [python.org/downloads](https://www.python.org/downloads/) — click the big yellow button, open the installer, follow the steps.

</details>

<details>
<summary><strong>Mac: "javac not found"</strong></summary>

The setup script installs Java automatically. If it fails:
```bash
brew install openjdk@21
```
Or download from [adoptium.net](https://adoptium.net) — pick macOS and your chip type.

</details>

<details>
<summary><strong>Linux: "g++ not found"</strong></summary>

```bash
sudo apt install g++          # Ubuntu/Debian
sudo dnf install gcc-c++      # Fedora
sudo pacman -S gcc             # Arch
```

</details>

<details>
<summary><strong>No window opens / Electron not found</strong></summary>

The app falls back to browser mode automatically. Open [http://localhost:8089](http://localhost:8089) in any browser.

</details>

<details>
<summary><strong>Something else is broken</strong></summary>

Re-run setup — it fixes most issues:
```bash
bash scripts/setup.sh
```

</details>

---

## Data Source

All market data comes from [Yahoo Finance](https://finance.yahoo.com) via the [yfinance](https://github.com/ranaroussi/yfinance) Python library. Free, no API key, no account needed.

---

## Disclaimer

> **For educational and informational purposes only.** This application does not provide financial advice. All analysis is generated from publicly available data and should not be used as the sole basis for investment decisions. Always do your own research or consult a financial advisor.

---

## License

Personal project. All rights reserved.

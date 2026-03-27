# Stock Analyzer

A beginner-friendly desktop stock analysis application that lets you search any stock, view real market data, and understand charts, metrics, and market context in simple language.

This is a **standalone desktop application** — it runs in its own window, not in a web browser.

---

## What It Does

- **Search any stock** by ticker symbol (AAPL, TSLA) or company name (Apple, Tesla)
- **View live price data** including current price, daily change, and market status
- **Interactive price charts** with selectable time ranges (1D, 5D, 1M, 6M, 1Y, 5Y)
- **Key statistics** like Market Cap, P/E Ratio, EPS, Volume, 52-Week Range, and more
- **Plain-English analysis** that tells you what the numbers actually mean
- **Recent news headlines** related to the stock
- **Learn page** — a built-in glossary that explains every metric in beginner-friendly language

---

## How It Works — Architecture

Stock Analyzer is a multi-language desktop application. Each language handles what it does best:

```
┌─────────────────────────────────────────────────┐
│              Stock Analyzer Window               │
│           (C++ Webview - Native Window)          │
├─────────────────────────────────────────────────┤
│                                                  │
│   ┌──────────────────────────────────────────┐   │
│   │         Frontend UI (HTML/CSS/JS)        │   │
│   │   • Search bar, charts, stats cards      │   │
│   │   • Chart.js for price visualization     │   │
│   │   • Modern dark theme, rounded design    │   │
│   └──────────────┬───────────────────────────┘   │
│                  │ HTTP (localhost)               │
│   ┌──────────────▼───────────────────────────┐   │
│   │        C++ Backend Server                │   │
│   │   • Local HTTP API (cpp-httplib)         │   │
│   │   • Technical analysis engine            │   │
│   │   • Moving averages, RSI, volatility     │   │
│   │   • Data caching for speed               │   │
│   │   • Subprocess orchestration             │   │
│   └──────┬───────────────────┬───────────────┘   │
│          │                   │                    │
│   ┌──────▼──────┐    ┌──────▼──────────────┐     │
│   │   Python    │    │       Java           │     │
│   │  yfinance   │    │  Interpretation      │     │
│   │  data fetch │    │  engine + glossary   │     │
│   └─────────────┘    └─────────────────────┘     │
│                                                   │
└───────────────────────────────────────────────────┘
```

### Technology Breakdown

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Window** | C++ with webview | Creates a native desktop window (not a browser) |
| **Backend Server** | C++ with cpp-httplib | Serves the UI and handles all API requests locally |
| **Analysis Engine** | C++ | Fast technical analysis — moving averages, RSI, MACD, volatility, trend detection |
| **Data Fetching** | Python with yfinance | Pulls real stock data from Yahoo Finance (free, no API key needed) |
| **Interpretation** | Java | Generates plain-English explanations of stock behavior |
| **Frontend UI** | HTML, CSS, JavaScript | Clean, modern interface with interactive charts |
| **Charts** | Chart.js | Responsive, interactive price and volume charts |
| **Data Format** | JSON (nlohmann/json) | All components communicate via JSON over local HTTP |

### Why These Languages?

- **C++** — Speed. The analysis engine crunches numbers fast. The HTTP server responds instantly. The webview is lightweight.
- **Python** — Data access. yfinance is the easiest, most reliable free stock data source. No API key, no trial, no limits.
- **Java** — Text processing. The interpretation engine parses data and generates readable analysis paragraphs.
- **HTML/CSS/JS** — UI. A modern, responsive interface with interactive charts rendered locally.

---

## Project Structure

```
Stock-Analyzer/
├── CMakeLists.txt                 # Build configuration
├── README.md                      # This file
│
├── src/
│   ├── cpp/
│   │   ├── main.cpp               # Entry point — starts server + opens window
│   │   ├── server.cpp             # Local HTTP API server
│   │   ├── server.h
│   │   ├── analysis.cpp           # Technical analysis (SMA, EMA, RSI, MACD, etc.)
│   │   ├── analysis.h
│   │   ├── subprocess.cpp         # Runs Python/Java and captures output
│   │   ├── subprocess.h
│   │   ├── cache.cpp              # In-memory data cache
│   │   └── cache.h
│   │
│   ├── python/
│   │   ├── data_fetcher.py        # Stock data via yfinance
│   │   ├── news_fetcher.py        # Recent news headlines
│   │   └── requirements.txt       # Python dependencies
│   │
│   ├── java/
│   │   └── src/
│   │       └── analyzer/
│   │           ├── Interpreter.java    # Plain-English stock analysis
│   │           └── Glossary.java       # Educational definitions
│   │
│   └── frontend/
│       ├── index.html             # Home / search page
│       ├── stock.html             # Stock detail page
│       ├── learn.html             # Educational glossary page
│       ├── css/
│       │   └── styles.css         # Full application styling
│       └── js/
│           ├── app.js             # Core app logic and routing
│           ├── chart.js           # Chart rendering
│           └── search.js          # Search functionality
│
├── lib/                           # Third-party header-only libraries
│   ├── httplib.h                  # cpp-httplib (HTTP server)
│   ├── json.hpp                   # nlohmann/json (JSON parsing)
│   └── webview.h                  # webview (native window)
│
├── scripts/
│   ├── setup.sh                   # One-time setup (installs dependencies)
│   └── run.sh                     # Build and launch the application
│
└── build/                         # Created during build (not in git)
```

---

## Requirements

### Operating System
- **Linux** (Ubuntu/Debian recommended)
- Windows and macOS support possible with minor build adjustments

### Software You Need Installed
- **g++** (C++17 or later) — usually pre-installed on Linux
- **CMake** (3.16 or later) — build system
- **Python 3.8+** — for stock data fetching
- **Java JDK 11+** — for the interpretation engine
- **pip** — Python package manager
- **pkg-config** — for finding system libraries
- **libwebkit2gtk-4.1-dev** — for the native window (Linux)

---

## Setup — First Time

### Quick Setup (Recommended)

Run the setup script — it installs everything you need:

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

This will:
1. Install system packages (CMake, JDK, webkit2gtk, pkg-config)
2. Install Python dependencies (yfinance)
3. Compile the Java modules
4. Build the C++ application

### Manual Setup

If you prefer to do it yourself:

```bash
# 1. Install system dependencies (Ubuntu/Debian)
sudo apt update
sudo apt install -y cmake default-jdk libwebkit2gtk-4.1-dev pkg-config python3-pip

# 2. Install Python packages
pip install -r src/python/requirements.txt

# 3. Compile Java classes
mkdir -p build/java
javac -d build/java src/java/src/analyzer/*.java

# 4. Build the C++ application
mkdir -p build
cd build
cmake ..
make -j$(nproc)
cd ..
```

---

## Running the Application

### Quick Launch

```bash
./scripts/run.sh
```

### Manual Launch

```bash
./build/stock_analyzer
```

A window will open with the Stock Analyzer interface. That's it — no browser needed.

---

## How to Use It

### Searching for a Stock
1. Open the app — you'll see a search bar on the home screen
2. Type a ticker symbol like **AAPL** or a company name like **Apple**
3. Press Enter or click Search
4. The stock detail page loads with all the data

### Reading the Stock Page
- **Top section** — Company name, ticker, current price, and daily change
- **Chart** — Click time range buttons (1D, 5D, 1M, 6M, 1Y, 5Y) to see different periods
- **Key Statistics** — Market Cap, P/E, EPS, Volume, 52-Week Range, and more
- **Analysis** — Plain-English interpretation of what the data means
- **News** — Recent headlines about the company

### Learning What Metrics Mean
- Click **Learn** in the navigation bar
- Browse definitions of every stock metric
- Each entry explains: what it is, why it matters, and what's considered high or low

---

## Data Source

All market data comes from **Yahoo Finance** via the `yfinance` Python library.

- Completely free
- No API key required
- No account needed
- No trial period
- Covers all major US stocks and many international markets
- Includes: price data, historical OHLCV, company info, key statistics, and news

---

## Disclaimer

This application is for **educational and informational purposes only**. It does not provide financial advice. All analysis is generated from publicly available data and should not be used as the sole basis for investment decisions. Always do your own research or consult a financial advisor.

---

## License

Personal project. All rights reserved.

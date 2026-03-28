# Stock Analyzer

A beginner-friendly stock analysis application that lets you search any stock, view real market data, and understand charts, metrics, and market context in simple language.

Built with **C++**, **Python**, **Java**, **HTML/CSS/JS**, and **Electron** — five languages working together as one application.

---

## Setup — Getting Started

The setup script handles everything automatically. Just follow the steps for your computer.

### Mac

1. Open **Terminal** (press `Cmd + Space`, type "Terminal", hit Enter)
2. Install Homebrew (the Mac package manager) if you don't have it — paste this and press Enter:
   ```
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
3. Navigate to the project folder:
   ```
   cd Stock-Analyzer
   ```
4. Run the setup:
   ```
   bash scripts/setup.sh
   ```
5. If a popup appears asking to install "Command Line Tools", click **Install** and wait for it to finish, then run `bash scripts/setup.sh` again.

### Windows (WSL)

1. Open **Ubuntu** (or your WSL terminal) from the Start menu
2. Navigate to the project folder:
   ```
   cd Stock-Analyzer
   ```
3. Run the setup:
   ```
   bash scripts/setup.sh
   ```

### Linux

1. Open a terminal
2. Navigate to the project folder:
   ```
   cd Stock-Analyzer
   ```
3. Run the setup:
   ```
   bash scripts/setup.sh
   ```

### What the setup installs

The setup script installs everything the app needs. You don't have to install anything yourself:

| Dependency | What it's for | How it's installed |
|------------|---------------|-------------------|
| **C++ compiler** (g++ / clang++) | Builds the backend server | Xcode tools (Mac), apt/dnf (Linux) |
| **Python 3** | Fetches stock data from Yahoo Finance | Usually pre-installed; Homebrew (Mac), apt (Linux) |
| **Java 17** | Generates plain-English stock analysis | Downloaded automatically to your home folder |
| **Node.js + Electron** | Desktop application window | Downloaded automatically |
| **yfinance** | Python library for stock data | Installed via pip |

No API keys, no accounts, no subscriptions needed. Everything is free.

---

## Running the App

After setup is complete:

```
./scripts/run.sh
```

That's it. The app will open in its own window.

### Other ways to run

| Command | What it does |
|---------|-------------|
| `./scripts/run.sh` | Opens the app in a desktop window |
| `./scripts/run.sh --headless` | Starts the server only — open `http://localhost:8089` in any browser |

---

## What It Does

- **Search any stock** by ticker symbol (AAPL, TSLA) or company name (Apple, Tesla)
- **Live price data** — current price, daily change, market status
- **Interactive charts** — price and volume with 6 time ranges (1D, 5D, 1M, 6M, 1Y, 5Y)
- **Analyst ratings** — semicircle gauge showing buy/sell consensus with explanations
- **Technical ratings** — momentum, trend, and oscillator analysis
- **AI overview** — generated stock summary with profit strategy recommendations
- **Forecast projections** — analyst price targets shown on the chart
- **16 key statistics** — Market Cap, P/E, EPS, Beta, Dividends, and more
- **Plain-English analysis** — what the numbers actually mean, in simple language
- **Recent news** — headlines with publisher and timestamps
- **Learn page** — 19 stock terms explained simply
- **5 color themes** — Dark, Light, Midnight, Ocean, Terminal

---

## Troubleshooting

### "command not found" when running setup
Make sure you're in the Stock-Analyzer folder first:
```
cd Stock-Analyzer
```

### Mac: "Install Command Line Tools" popup
Click **Install**, wait for it to finish (can take a few minutes), then run `bash scripts/setup.sh` again.

### Mac: "python3 not found"
Download Python from https://www.python.org/downloads/ — click the big yellow button, open the downloaded file, and follow the installer.

### Mac: "javac not found" / needs a "kit"
The setup script installs Java automatically. If it fails, install it manually:
```
brew install openjdk@17
```
Or download from https://adoptium.net — pick "Latest LTS Release", macOS, and your chip type (Apple Silicon = aarch64, Intel = x64).

### Linux: "g++ not found"
```
sudo apt install g++
```

### "Electron not found" or no window opens
The app falls back to browser mode. Just open http://localhost:8089 in any browser.

### Something else is broken
Run setup again — it will fix most issues:
```
bash scripts/setup.sh
```

---

## How It Works — Architecture

```
┌──────────────────────────────────────────────────────┐
│           Stock Analyzer Desktop Window               │
│              (Electron - Chromium)                     │
├──────────────────────────────────────────────────────┤
│                                                       │
│   ┌──────────────────────────────────────────────┐    │
│   │         Frontend UI (HTML/CSS/JS)            │    │
│   │   Search, charts, ratings, themes            │    │
│   │   Chart.js for price + volume + forecasts    │    │
│   └──────────────────┬───────────────────────────┘    │
│                      │ HTTP (localhost:8089)           │
│   ┌──────────────────▼───────────────────────────┐    │
│   │          C++ Backend Server                   │    │
│   │   REST API (cpp-httplib)                      │    │
│   │   Technical analysis engine                   │    │
│   │   In-memory data cache                        │    │
│   └──────────┬───────────────────┬───────────────┘    │
│              │                   │                     │
│   ┌──────────▼──────┐   ┌───────▼──────────────┐     │
│   │     Python      │   │        Java           │     │
│   │   Stock data    │   │   Plain-English        │     │
│   │   via yfinance  │   │   analysis engine      │     │
│   └─────────────────┘   └──────────────────────┘     │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### Why These Languages?

- **C++** — Speed. Technical analysis (SMA, EMA, RSI, MACD) runs in milliseconds.
- **Python** — Data. yfinance is the best free stock data source available.
- **Java** — Text. Generates readable explanations of what the numbers mean.
- **JavaScript** — UI. Interactive charts, search, and theme switching.
- **HTML/CSS** — Layout and styling. 5 themes, responsive design.

---

## Project Structure

```
Stock-Analyzer/
├── scripts/
│   ├── setup.sh          # Run this first — installs everything
│   ├── run.sh            # Run this to launch the app
│   └── package.sh        # Package into standalone app
│
├── src/
│   ├── cpp/              # C++ backend server + analysis engine
│   ├── python/           # Stock data fetching (yfinance)
│   ├── java/             # Plain-English interpretation engine
│   ├── electron/         # Desktop window shell
│   └── frontend/         # UI (HTML, CSS, JavaScript)
│
├── lib/                  # C++ libraries (httplib, json)
├── build/                # Built app (created by setup)
└── Makefile              # Build configuration
```

---

## API Endpoints

The C++ server runs on `localhost:8089`:

| Endpoint | Description |
|----------|-------------|
| `GET /api/search?q=apple` | Search tickers |
| `GET /api/quote/AAPL` | Current price + stats |
| `GET /api/history/AAPL?period=1mo` | Price history |
| `GET /api/analysis/AAPL?period=1y` | Technical indicators |
| `GET /api/interpret/AAPL` | Plain-English analysis |
| `GET /api/news/AAPL` | Recent news |
| `GET /api/glossary` | Stock term definitions |

---

## Data Source

All data comes from **Yahoo Finance** via yfinance. Free, no API key, no account needed.

---

## Disclaimer

For **educational and informational purposes only**. Not financial advice. Always do your own research.

---

## License

Personal project. All rights reserved.

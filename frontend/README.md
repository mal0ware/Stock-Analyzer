# Stock Analyzer — Frontend

React 19 + TypeScript + Vite SPA that powers the Stock Analyzer desktop app and Docker deployment.

For project-wide context, build instructions, and architecture, see the [main README](../README.md).

## Stack

- **React 19** + **TypeScript** (strict mode)
- **Vite** for dev server and production bundling
- **Tailwind CSS v4** with theme-aware CSS custom properties
- **Zustand** for shared client state (watchlist, simulator, tabs)
- **lightweight-charts** (TradingView's open-source library) for candlestick rendering
- **shadcn/ui** primitives (locally vendored, MIT)

## Layout

```
src/
├── pages/             # Route-level components (Overview, SymbolDetail, Simulator, Watchlist, Learn)
├── components/        # Shared UI: Layout, CandlestickChart, OrderBook, OrderPanel, TabBar, ...
├── stores/            # Zustand stores: watchlistStore, simulatorStore, tabStore
├── hooks/             # useWebSocket, useTheme, useMagnetic, useTilt, useSpotlight, useScrollReveal
├── lib/               # API client, formatters, types
└── index.css          # Theme variables, animations, reduced-motion overrides
```

## Develop

```bash
npm install
npm run dev          # Vite dev server with HMR (default :5173)
npm run build        # Production bundle to dist/
npx tsc --noEmit     # Type check
```

The dev server expects the backend at `http://localhost:8080` (configurable via `VITE_API_URL`).

## Theming

Themes are pure CSS — no runtime library. Each palette is a `[data-theme="..."]` block in [src/index.css](src/index.css) defining custom properties (`--color-bg`, `--color-fg`, `--color-accent`, etc.). Adding a new theme is a one-file change.

## Charts

[CandlestickChart.tsx](src/components/CandlestickChart.tsx) wraps `lightweight-charts` and exposes a thin props API: `data`, `priceLines`, `onPriceLineMove`, `height`, `showVolume`. It re-applies theme colors on theme switch and resizes via `ResizeObserver`. The simulator uses it with draggable price lines for SL/TP/limit visualization.

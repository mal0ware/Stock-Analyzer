import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../lib/api';
import { formatPct, trendColor, sentimentColor } from '../lib/format';
import { useTabStore } from '../stores/tabStore';

const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'SPY', 'QQQ', 'META', 'AMD'];

interface WatchlistItem {
  symbol: string;
  added_at: string;
  snapshot?: api.SnapshotData;
  loading: boolean;
  isDefault?: boolean;
}

export default function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDefaults, setShowDefaults] = useState(true);
  const [customSymbols, setCustomSymbols] = useState<string[]>([]);

  useEffect(() => {
    loadWatchlist();
  }, []);

  const loadWatchlist = async () => {
    try {
      const wl = await api.getWatchlist();
      const custom = wl.symbols.map((s) => s.symbol);
      setCustomSymbols(custom);

      // Merge custom + defaults (defaults only if showDefaults)
      const allSymbols = new Set(custom);
      const defaultOnly = DEFAULT_SYMBOLS.filter((s) => !allSymbols.has(s));

      const initial: WatchlistItem[] = [
        ...custom.map((s) => ({
          symbol: s,
          added_at: wl.symbols.find((w) => w.symbol === s)?.added_at ?? '',
          loading: true,
          isDefault: false,
        })),
        ...defaultOnly.map((s) => ({
          symbol: s,
          added_at: '',
          loading: true,
          isDefault: true,
        })),
      ];
      setItems(initial);
      setLoading(false);

      // Fetch snapshots in parallel
      const allItems = initial;
      const snapshots = await Promise.allSettled(
        allItems.map((item) => api.snapshot(item.symbol))
      );
      setItems((prev) =>
        prev.map((item, i) => ({
          ...item,
          snapshot: snapshots[i]?.status === 'fulfilled' ? snapshots[i].value : undefined,
          loading: false,
        }))
      );
    } catch {
      setLoading(false);
    }
  };

  const removeSymbol = async (symbol: string) => {
    try {
      await api.updateWatchlist(symbol, 'remove');
      setCustomSymbols((prev) => prev.filter((s) => s !== symbol));
      setItems((prev) => {
        // If it's a default symbol, mark it as default instead of removing
        if (DEFAULT_SYMBOLS.includes(symbol)) {
          return prev.map((i) => i.symbol === symbol ? { ...i, isDefault: true } : i);
        }
        return prev.filter((i) => i.symbol !== symbol);
      });
    } catch { /* ignore */ }
  };

  const addSymbol = async (symbol: string) => {
    try {
      await api.updateWatchlist(symbol, 'add');
      setCustomSymbols((prev) => [...prev, symbol]);
      setItems((prev) =>
        prev.map((i) => i.symbol === symbol ? { ...i, isDefault: false } : i)
      );
    } catch { /* ignore */ }
  };

  const visibleItems = showDefaults
    ? items
    : items.filter((i) => !i.isDefault);

  if (loading) return (
    <div className="space-y-6">
      <div className="skeleton h-8 w-48 rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Watchlist</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {customSymbols.length} custom symbol{customSymbols.length !== 1 ? 's' : ''} tracked
          </p>
        </div>
        <button
          onClick={() => setShowDefaults(!showDefaults)}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            showDefaults
              ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/20'
              : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text-primary)]'
          }`}
        >
          {showDefaults ? 'Showing Defaults' : 'Custom Only'}
        </button>
      </div>

      {visibleItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <svg className="w-16 h-16 text-[var(--text-muted)] opacity-30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
          </svg>
          <div className="text-lg font-semibold text-[var(--text-primary)]">No symbols yet</div>
          <div className="text-sm text-[var(--text-muted)]">Search for a symbol and add it, or enable defaults</div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((item) => (
            <WatchlistCard
              key={item.symbol}
              item={item}
              onRemove={() => removeSymbol(item.symbol)}
              onAdd={() => addSymbol(item.symbol)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WatchlistCard({ item, onRemove, onAdd }: {
  item: WatchlistItem;
  onRemove: () => void;
  onAdd: () => void;
}) {
  const s = item.snapshot;
  const changePct = s?.price.change_pct;
  const isUp = changePct != null && changePct >= 0;

  return (
    <div className={`group relative bg-[var(--bg-card)] rounded-2xl border overflow-hidden transition-all hover:shadow-lg hover:shadow-black/5 ${
      item.isDefault ? 'border-dashed border-[var(--border)]' : 'border-[var(--border)]'
    }`}>
      <Link
        to={`/symbol/${item.symbol}`}
        onClick={() => useTabStore.getState().openTab(item.symbol)}
        className="block p-4"
      >
        {/* Top row: symbol + badge */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-[var(--text-primary)]">{item.symbol}</span>
            {item.isDefault && (
              <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-primary)] px-1.5 py-0.5 rounded-md">
                Default
              </span>
            )}
          </div>
          {s && changePct != null && (
            <span className={`text-sm font-bold font-mono tabular-nums px-2 py-0.5 rounded-lg ${
              isUp ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {formatPct(changePct)}
            </span>
          )}
        </div>

        {item.loading ? (
          <div className="space-y-2">
            <div className="skeleton h-6 w-24 rounded-lg" />
            <div className="skeleton h-3 w-32 rounded-lg" />
          </div>
        ) : s ? (
          <>
            {/* Price */}
            <div className="text-2xl font-bold font-mono text-[var(--text-primary)] tabular-nums">
              ${s.price.current.toFixed(2)}
            </div>

            {/* Indicators row */}
            <div className="flex items-center gap-3 mt-3">
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  s.signals.trend.includes('uptrend') ? 'bg-emerald-400' :
                  s.signals.trend.includes('downtrend') ? 'bg-red-400' : 'bg-yellow-400'
                }`} />
                <span className={`text-xs font-medium capitalize ${trendColor(s.signals.trend)}`}>
                  {s.signals.trend.replace('_', ' ')}
                </span>
              </div>

              {s.signals.anomaly_flag && (
                <span className="text-[10px] font-bold uppercase text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-md">
                  Anomaly
                </span>
              )}

              {s.sentiment.composite != null && (
                <span className={`text-xs font-mono ${sentimentColor(s.sentiment.composite)}`}>
                  {s.sentiment.composite > 0 ? '+' : ''}{s.sentiment.composite.toFixed(2)}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="text-sm text-[var(--text-muted)]">Data unavailable</div>
        )}
      </Link>

      {/* Action button */}
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        {item.isDefault ? (
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            className="text-[10px] font-semibold text-[var(--accent)] bg-[var(--accent-soft)] hover:bg-[var(--accent)] hover:text-white px-2.5 py-1 rounded-lg transition-colors"
          >
            + Add
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="text-[10px] font-semibold text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 px-2.5 py-1 rounded-lg transition-colors"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../lib/api';
import { formatPct, pctColor, trendColor, sentimentColor } from '../lib/format';

interface WatchlistItem {
  symbol: string;
  added_at: string;
  snapshot?: api.SnapshotData;
  loading: boolean;
}

export default function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWatchlist();
  }, []);

  const loadWatchlist = async () => {
    try {
      const wl = await api.getWatchlist();
      const initial: WatchlistItem[] = wl.symbols.map((s) => ({
        symbol: s.symbol,
        added_at: s.added_at,
        loading: true,
      }));
      setItems(initial);
      setLoading(false);

      // Load snapshots in parallel
      const snapshots = await Promise.allSettled(
        wl.symbols.map((s) => api.snapshot(s.symbol))
      );
      setItems((prev) =>
        prev.map((item, i) => ({
          ...item,
          snapshot: snapshots[i].status === 'fulfilled' ? snapshots[i].value : undefined,
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
      setItems((prev) => prev.filter((i) => i.symbol !== symbol));
    } catch { /* ignore */ }
  };

  if (loading) return <div className="text-gray-400 animate-pulse text-center py-20">Loading watchlist...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Watchlist</h1>

      {items.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">No symbols in your watchlist</p>
          <p className="text-sm mt-1">Search for a symbol and add it to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.symbol}
              className="bg-gray-800/50 rounded-lg border border-gray-700/50 p-4 flex items-center gap-4"
            >
              <Link
                to={`/symbol/${item.symbol}`}
                className="flex-1 flex items-center gap-4 hover:opacity-80 transition-opacity"
              >
                <div className="w-20">
                  <div className="font-semibold text-white text-lg">{item.symbol}</div>
                </div>

                {item.loading ? (
                  <div className="text-gray-500 text-sm animate-pulse">Loading...</div>
                ) : item.snapshot ? (
                  <>
                    <div className="w-24 text-right">
                      <div className="text-white font-medium">${item.snapshot.price.current.toFixed(2)}</div>
                      <div className={`text-sm ${pctColor(item.snapshot.price.change_pct)}`}>
                        {formatPct(item.snapshot.price.change_pct)}
                      </div>
                    </div>
                    <div className="w-28 text-center">
                      <div className={`text-sm font-medium capitalize ${trendColor(item.snapshot.signals.trend)}`}>
                        {item.snapshot.signals.trend.replace('_', ' ')}
                      </div>
                      <div className="text-xs text-gray-500">
                        {(item.snapshot.signals.trend_confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="w-20 text-center">
                      <div className={`text-sm ${item.snapshot.signals.anomaly_flag ? 'text-orange-400 font-medium' : 'text-gray-400'}`}>
                        {item.snapshot.signals.anomaly_score.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">anomaly</div>
                    </div>
                    <div className="w-20 text-center">
                      <div className={`text-sm ${sentimentColor(item.snapshot.sentiment.composite)}`}>
                        {item.snapshot.sentiment.composite != null
                          ? item.snapshot.sentiment.composite.toFixed(2)
                          : '—'}
                      </div>
                      <div className="text-xs text-gray-500">sentiment</div>
                    </div>
                  </>
                ) : (
                  <div className="text-gray-500 text-sm">Data unavailable</div>
                )}
              </Link>

              <button
                onClick={() => removeSymbol(item.symbol)}
                className="text-gray-500 hover:text-red-400 transition-colors text-sm px-2"
                title="Remove from watchlist"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

  if (loading) return (
    <div className="space-y-6">
      <div className="skeleton h-8 w-32" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-lg" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Watchlist</h1>
        <p className="text-sm text-gray-500 mt-1">{items.length} symbol{items.length !== 1 ? 's' : ''} tracked</p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-gray-500 text-lg">No symbols in your watchlist</div>
          <p className="text-gray-600 text-sm mt-1">Search for a symbol and add it to get started</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div
              key={item.symbol}
              className="bg-[#131620] rounded-lg border border-[#1e2235] p-4 flex items-center gap-4 hover:bg-[#1a1e2e] transition-colors"
            >
              <Link
                to={`/symbol/${item.symbol}`}
                className="flex-1 flex items-center gap-4"
              >
                <div className="w-20">
                  <div className="font-semibold text-white text-lg">{item.symbol}</div>
                </div>

                {item.loading ? (
                  <div className="flex gap-3">
                    <div className="skeleton h-5 w-20" />
                    <div className="skeleton h-5 w-16" />
                  </div>
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
                    <div className="w-20 text-center hidden sm:block">
                      <div className={`text-sm ${item.snapshot.signals.anomaly_flag ? 'text-orange-400 font-medium' : 'text-gray-400'}`}>
                        {item.snapshot.signals.anomaly_score.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-600">anomaly</div>
                    </div>
                    <div className="w-20 text-center hidden sm:block">
                      <div className={`text-sm ${sentimentColor(item.snapshot.sentiment.composite)}`}>
                        {item.snapshot.sentiment.composite != null
                          ? item.snapshot.sentiment.composite.toFixed(2)
                          : '—'}
                      </div>
                      <div className="text-xs text-gray-600">sentiment</div>
                    </div>
                  </>
                ) : (
                  <div className="text-gray-600 text-sm">Data unavailable</div>
                )}
              </Link>

              <button
                onClick={() => removeSymbol(item.symbol)}
                className="text-gray-600 hover:text-red-400 transition-colors text-xs px-2 py-1 rounded hover:bg-red-500/10"
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

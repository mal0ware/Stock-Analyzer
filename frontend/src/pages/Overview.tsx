import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../lib/api';
import { formatPct, pctColor } from '../lib/format';

export default function Overview() {
  const [data, setData] = useState<api.MarketOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.marketOverview()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-white">Market Overview</h1>

      {/* Sector Heatmap */}
      <section>
        <h2 className="text-lg font-medium text-gray-300 mb-3">Sectors</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {data.sectors.map((s) => (
            <div
              key={s.etf}
              className={`rounded-lg p-3 border ${
                s.change_pct == null
                  ? 'border-gray-700 bg-gray-800/50'
                  : s.change_pct >= 0
                    ? 'border-emerald-800/50 bg-emerald-900/20'
                    : 'border-red-800/50 bg-red-900/20'
              }`}
            >
              <div className="text-sm text-gray-400">{s.sector}</div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-white font-medium">
                  {s.price != null ? `$${s.price.toFixed(2)}` : '—'}
                </span>
                <span className={`text-sm font-medium ${pctColor(s.change_pct)}`}>
                  {formatPct(s.change_pct)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Top Movers */}
      <div className="grid md:grid-cols-2 gap-6">
        <section>
          <h2 className="text-lg font-medium text-emerald-400 mb-3">Top Gainers</h2>
          <div className="space-y-1">
            {data.movers.gainers.map((m) => (
              <Link
                key={m.symbol}
                to={`/symbol/${m.symbol}`}
                className="flex items-center justify-between bg-gray-800/50 rounded px-3 py-2 hover:bg-gray-800 transition-colors"
              >
                <span className="font-medium text-white">{m.symbol}</span>
                <div className="text-right">
                  <span className="text-gray-300 text-sm">${m.price.toFixed(2)}</span>
                  <span className="text-emerald-400 text-sm font-medium ml-3">
                    {formatPct(m.change_pct)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium text-red-400 mb-3">Top Losers</h2>
          <div className="space-y-1">
            {data.movers.losers.map((m) => (
              <Link
                key={m.symbol}
                to={`/symbol/${m.symbol}`}
                className="flex items-center justify-between bg-gray-800/50 rounded px-3 py-2 hover:bg-gray-800 transition-colors"
              >
                <span className="font-medium text-white">{m.symbol}</span>
                <div className="text-right">
                  <span className="text-gray-300 text-sm">${m.price.toFixed(2)}</span>
                  <span className="text-red-400 text-sm font-medium ml-3">
                    {formatPct(m.change_pct)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400 animate-pulse">Loading market data...</div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-red-400">Error: {message}</div>
    </div>
  );
}

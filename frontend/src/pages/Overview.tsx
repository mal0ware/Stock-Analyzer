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

  if (loading) return <OverviewSkeleton />;
  if (error) return <ErrorScreen message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Market Overview</h1>
        <p className="text-sm text-gray-500 mt-1">Real-time sector performance and top movers</p>
      </div>

      {/* Sector Heatmap */}
      <section>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Sectors</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {data.sectors.map((s) => (
            <div
              key={s.etf}
              className={`rounded-lg p-3 border transition-colors ${
                s.change_pct == null
                  ? 'border-[#1e2235] bg-[#131620]'
                  : s.change_pct >= 0
                    ? 'border-emerald-900/40 bg-emerald-950/20'
                    : 'border-red-900/40 bg-red-950/20'
              }`}
            >
              <div className="text-xs text-gray-500 font-medium">{s.sector}</div>
              <div className="flex items-baseline justify-between mt-1.5">
                <span className="text-white font-semibold text-sm">
                  {s.price != null ? `$${s.price.toFixed(2)}` : '—'}
                </span>
                <span className={`text-sm font-semibold ${pctColor(s.change_pct)}`}>
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
          <h2 className="text-sm font-medium text-emerald-400 uppercase tracking-wider mb-3">Top Gainers</h2>
          <div className="space-y-1">
            {data.movers.gainers.map((m) => (
              <Link
                key={m.symbol}
                to={`/symbol/${m.symbol}`}
                className="flex items-center justify-between bg-[#131620] rounded-lg px-4 py-2.5 hover:bg-[#1a1e2e] transition-colors border border-transparent hover:border-[#1e2235]"
              >
                <span className="font-semibold text-white text-sm">{m.symbol}</span>
                <div className="text-right flex items-center gap-4">
                  <span className="text-gray-300 text-sm">${m.price.toFixed(2)}</span>
                  <span className="text-emerald-400 text-sm font-semibold min-w-[64px] text-right">
                    {formatPct(m.change_pct)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium text-red-400 uppercase tracking-wider mb-3">Top Losers</h2>
          <div className="space-y-1">
            {data.movers.losers.map((m) => (
              <Link
                key={m.symbol}
                to={`/symbol/${m.symbol}`}
                className="flex items-center justify-between bg-[#131620] rounded-lg px-4 py-2.5 hover:bg-[#1a1e2e] transition-colors border border-transparent hover:border-[#1e2235]"
              >
                <span className="font-semibold text-white text-sm">{m.symbol}</span>
                <div className="text-right flex items-center gap-4">
                  <span className="text-gray-300 text-sm">${m.price.toFixed(2)}</span>
                  <span className="text-red-400 text-sm font-semibold min-w-[64px] text-right">
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

function OverviewSkeleton() {
  return (
    <div className="space-y-8">
      <div>
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-4 w-72 mt-2" />
      </div>
      <section>
        <div className="skeleton h-4 w-20 mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-lg" />
          ))}
        </div>
      </section>
      <div className="grid md:grid-cols-2 gap-6">
        {[0, 1].map((col) => (
          <section key={col}>
            <div className="skeleton h-4 w-24 mb-3" />
            <div className="space-y-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-11 rounded-lg" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-2">
      <div className="text-red-400 font-medium">Failed to load market data</div>
      <div className="text-gray-500 text-sm">{message}</div>
    </div>
  );
}

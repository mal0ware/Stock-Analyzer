import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../lib/api';

export default function Anomalies() {
  const [data, setData] = useState<api.AnomaliesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.anomalies(100)
      .then(setData)
      .catch(() => setData({ anomalies: [], count: 0 }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-6">
      <div className="skeleton h-8 w-40" />
      <div className="skeleton h-4 w-80" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-lg" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Anomaly Feed</h1>
        <p className="text-sm text-gray-500 mt-1">
          Unusual price or volume activity detected by the Isolation Forest model
        </p>
      </div>

      {!data || data.count === 0 ? (
        <div className="text-center py-20">
          <div className="text-gray-500 text-lg">No anomalies detected</div>
          <p className="text-gray-600 text-sm mt-1">
            Anomalies appear when price or volume deviates significantly from historical patterns.
            Add symbols to your watchlist and check back later.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {data.anomalies.map((a, i) => (
            <Link
              key={`${a.symbol}-${i}`}
              to={`/symbol/${a.symbol}`}
              className="flex items-center justify-between bg-[#131620] rounded-lg border border-orange-900/30 p-4 hover:bg-[#1a1e2e] transition-colors"
            >
              <div className="flex items-center gap-4">
                <span className="font-semibold text-white text-lg">{a.symbol}</span>
                <span className="text-orange-400 font-medium text-sm">
                  Score: {a.anomaly_score.toFixed(3)}
                </span>
              </div>
              <div className="flex items-center gap-6 text-sm">
                {a.price_change_pct != null && (
                  <span className={a.price_change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {a.price_change_pct >= 0 ? '+' : ''}{a.price_change_pct.toFixed(2)}%
                  </span>
                )}
                {a.volume_ratio != null && (
                  <span className="text-gray-400">
                    {a.volume_ratio.toFixed(1)}x vol
                  </span>
                )}
                <span className="text-gray-600 text-xs">
                  {new Date(a.detected_at).toLocaleDateString()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

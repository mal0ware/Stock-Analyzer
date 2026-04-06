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

  if (loading) return <div className="text-gray-400 animate-pulse text-center py-20">Loading anomalies...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Anomaly Feed</h1>
        <p className="text-sm text-gray-500 mt-1">
          Unusual price or volume activity detected by the Isolation Forest model
        </p>
      </div>

      {!data || data.count === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">No anomalies detected</p>
          <p className="text-sm mt-1">
            Anomalies are detected when price or volume deviates significantly from historical patterns.
            Add symbols to your watchlist and check back later.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.anomalies.map((a, i) => (
            <Link
              key={`${a.symbol}-${i}`}
              to={`/symbol/${a.symbol}`}
              className="flex items-center justify-between bg-gray-800/50 rounded-lg border border-orange-800/30 p-4 hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-center gap-4">
                <span className="font-semibold text-white text-lg">{a.symbol}</span>
                <span className="text-orange-400 font-medium">
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
                    {a.volume_ratio.toFixed(1)}x volume
                  </span>
                )}
                <span className="text-gray-500">
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

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, CartesianGrid,
} from 'recharts';
import * as api from '../lib/api';
import { formatPct, formatLargeNumber, pctColor, trendColor, sentimentColor } from '../lib/format';
import { useWebSocket } from '../hooks/useWebSocket';

const PERIODS = ['1d', '5d', '1mo', '6mo', '1y', '5y'] as const;

export default function SymbolDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const [snap, setSnap] = useState<api.SnapshotData | null>(null);
  const [hist, setHist] = useState<api.HistoryData | null>(null);
  const [period, setPeriod] = useState<string>('1mo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inWatchlist, setInWatchlist] = useState(false);
  const { data: liveData, connected } = useWebSocket(symbol ?? null);

  const loadData = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError('');
    try {
      const [snapData, histData, wl] = await Promise.all([
        api.snapshot(symbol),
        api.history(symbol, period),
        api.getWatchlist(),
      ]);
      setSnap(snapData);
      setHist(histData);
      setInWatchlist(wl.symbols.some((s) => s.symbol === symbol.toUpperCase()));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [symbol, period]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleWatchlist = async () => {
    if (!symbol) return;
    try {
      await api.updateWatchlist(symbol, inWatchlist ? 'remove' : 'add');
      setInWatchlist(!inWatchlist);
    } catch { /* ignore */ }
  };

  if (loading) return <div className="text-gray-400 animate-pulse text-center py-20">Loading {symbol}...</div>;
  if (error) return <div className="text-red-400 text-center py-20">Error: {error}</div>;
  if (!snap || !hist) return null;

  const currentPrice = liveData?.price ?? snap.price.current;
  const changePct = liveData?.change_pct ?? snap.price.change_pct;

  const chartData = hist.dates.map((d, i) => ({
    date: d,
    close: hist.closes[i],
    volume: hist.volumes[i],
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">{snap.symbol}</h1>
            {connected && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Live" />}
          </div>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="text-2xl text-white font-semibold">${currentPrice.toFixed(2)}</span>
            <span className={`text-lg font-medium ${pctColor(changePct)}`}>{formatPct(changePct)}</span>
          </div>
        </div>
        <button
          onClick={toggleWatchlist}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            inWatchlist
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-red-600/20 hover:text-red-400 hover:border-red-500/30'
              : 'bg-gray-800 text-gray-300 border border-gray-700 hover:border-blue-500/50'
          }`}
        >
          {inWatchlist ? 'In Watchlist' : '+ Watchlist'}
        </button>
      </div>

      {/* ML Signals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SignalCard
          label="Trend"
          value={snap.signals.trend.replace('_', ' ')}
          sub={`${(snap.signals.trend_confidence * 100).toFixed(0)}% confidence`}
          color={trendColor(snap.signals.trend)}
        />
        <SignalCard
          label="Anomaly Score"
          value={snap.signals.anomaly_score.toFixed(2)}
          sub={snap.signals.anomaly_flag ? 'ANOMALY DETECTED' : 'Normal'}
          color={snap.signals.anomaly_flag ? 'text-orange-400' : 'text-gray-300'}
        />
        <SignalCard
          label="Sentiment"
          value={snap.sentiment.label ?? (snap.sentiment.composite != null ? snap.sentiment.composite.toFixed(2) : '—')}
          sub={snap.sentiment.method ? `via ${snap.sentiment.method}` : `${snap.sentiment.sample_size} sources`}
          color={sentimentColor(snap.sentiment.composite)}
        />
        <SignalCard
          label="Volume"
          value={formatLargeNumber(snap.price.volume)}
          sub="Today"
          color="text-gray-300"
        />
      </div>

      {/* Period selector */}
      <div className="flex gap-1">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              period === p ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Price chart */}
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
            <YAxis domain={['auto', 'auto']} tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} width={60} />
            <Tooltip
              contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '6px' }}
              labelStyle={{ color: '#9ca3af' }}
              itemStyle={{ color: '#e5e7eb' }}
            />
            <Area type="monotone" dataKey="close" stroke="#3b82f6" fill="url(#priceGradient)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Volume chart */}
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
        <h3 className="text-sm text-gray-400 mb-2">Volume</h3>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={chartData}>
            <XAxis dataKey="date" tick={false} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} width={60} />
            <Tooltip
              contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '6px' }}
              labelStyle={{ color: '#9ca3af' }}
            />
            <Bar dataKey="volume" fill="#6366f1" opacity={0.6} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SignalCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold mt-1 capitalize ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{sub}</div>
    </div>
  );
}

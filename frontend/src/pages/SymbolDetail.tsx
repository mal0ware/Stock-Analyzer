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

  if (loading) return <DetailSkeleton symbol={symbol} />;
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
            <h1 className="text-3xl font-bold text-white tracking-tight">{snap.symbol}</h1>
            {connected && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Live" />}
          </div>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="text-2xl text-white font-semibold">${currentPrice.toFixed(2)}</span>
            <span className={`text-lg font-semibold ${pctColor(changePct)}`}>{formatPct(changePct)}</span>
          </div>
        </div>
        <button
          onClick={toggleWatchlist}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            inWatchlist
              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/30'
              : 'bg-[#131620] text-gray-300 border border-[#1e2235] hover:border-blue-500/40 hover:text-blue-400'
          }`}
        >
          {inWatchlist ? 'In Watchlist' : '+ Watchlist'}
        </button>
      </div>

      {/* ML Signals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
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
      <div className="flex gap-1 bg-[#131620] rounded-lg p-1 w-fit">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              period === p
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Price chart */}
      <div className="bg-[#131620] rounded-xl p-4 border border-[#1e2235]">
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2235" />
            <XAxis dataKey="date" tick={{ fill: '#4b5068', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis domain={['auto', 'auto']} tick={{ fill: '#4b5068', fontSize: 11 }} tickLine={false} axisLine={false} width={60} />
            <Tooltip
              contentStyle={{ background: '#131620', border: '1px solid #1e2235', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
              labelStyle={{ color: '#8b8fa3' }}
              itemStyle={{ color: '#e5e7eb' }}
            />
            <Area type="monotone" dataKey="close" stroke="#3b82f6" fill="url(#priceGradient)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Volume chart */}
      <div className="bg-[#131620] rounded-xl p-4 border border-[#1e2235]">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Volume</h3>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={chartData}>
            <XAxis dataKey="date" tick={false} axisLine={false} />
            <YAxis tick={{ fill: '#4b5068', fontSize: 10 }} tickLine={false} axisLine={false} width={60} />
            <Tooltip
              contentStyle={{ background: '#131620', border: '1px solid #1e2235', borderRadius: '8px' }}
              labelStyle={{ color: '#8b8fa3' }}
            />
            <Bar dataKey="volume" fill="#6366f1" opacity={0.5} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SignalCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-[#131620] rounded-xl p-3.5 border border-[#1e2235]">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">{label}</div>
      <div className={`text-lg font-semibold mt-1 capitalize ${color}`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>
    </div>
  );
}

function DetailSkeleton({ symbol }: { symbol?: string }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-3xl font-bold text-white/30">{symbol ?? '...'}</div>
        <div className="skeleton h-8 w-36 mt-2" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-xl" />
        ))}
      </div>
      <div className="skeleton h-8 w-64 rounded-lg" />
      <div className="skeleton h-80 rounded-xl" />
      <div className="skeleton h-28 rounded-xl" />
    </div>
  );
}

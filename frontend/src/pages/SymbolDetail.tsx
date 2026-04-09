import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, CartesianGrid,
} from 'recharts';
import * as api from '../lib/api';
import { formatLargeNumber, pctColor } from '../lib/format';
import { useWebSocket } from '../hooks/useWebSocket';

const PERIODS = ['1d', '5d', '1mo', '6mo', '1y', '5y'] as const;

function fmt(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return '--';
  return Number(n).toFixed(2);
}

function fmtLarge(n: number | null | undefined): string {
  if (n == null) return '--';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffH = Math.floor((now.getTime() - d.getTime()) / 3600000);
    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

export default function SymbolDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const [quoteData, setQuoteData] = useState<api.QuoteData | null>(null);
  const [snap, setSnap] = useState<api.SnapshotData | null>(null);
  const [hist, setHist] = useState<api.HistoryData | null>(null);
  const [analysisData, setAnalysisData] = useState<api.AnalysisData | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [articles, setArticles] = useState<api.NewsArticle[]>([]);
  const [period, setPeriod] = useState<string>('1mo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inWatchlist, setInWatchlist] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const { data: liveData, connected } = useWebSocket(symbol ?? null);

  const loadData = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError('');
    try {
      const [q, snapData, histData, wl] = await Promise.all([
        api.quote(symbol),
        api.snapshot(symbol).catch(() => null),
        api.history(symbol, period),
        api.getWatchlist(),
      ]);
      setQuoteData(q);
      setSnap(snapData);
      setHist(histData);
      setInWatchlist(wl.symbols.some((s) => s.symbol === symbol.toUpperCase()));

      // Non-critical data — load without blocking
      api.analysis(symbol, period).then(setAnalysisData).catch(() => {});
      api.interpret(symbol).then(d => setInsights(d.insights || [])).catch(() => {});
      api.news(symbol).then(d => setArticles(d.articles || [])).catch(() => {});
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
  if (!quoteData || !hist) return null;

  const q = quoteData;
  const currentPrice = liveData?.price ?? q.price ?? 0;
  const changePct = liveData?.change_pct ?? q.changePercent;
  const change = q.change;

  const qAny = q as any;
  const targetMean = qAny.targetMeanPrice;
  const targetHigh = qAny.targetHighPrice;
  const targetLow = qAny.targetLowPrice;
  const showForecast = targetMean && targetHigh && targetLow
    && ['1mo', '6mo', '1y', '5y'].includes(period);

  const baseChartData = hist.dates.map((d, i) => ({
    date: d,
    close: hist.closes[i],
    volume: hist.volumes[i],
    forecastMean: null as number | null,
    forecastHigh: null as number | null,
    forecastLow: null as number | null,
  }));

  // Add forecast projection points
  if (showForecast) {
    const lastPrice = hist.closes[hist.closes.length - 1];
    const lastDate = new Date(hist.dates[hist.dates.length - 1]);
    const numPoints = Math.max(Math.round(hist.dates.length * 0.25), 5);

    // Connect forecast to last real data point
    baseChartData[baseChartData.length - 1].forecastMean = lastPrice;
    baseChartData[baseChartData.length - 1].forecastHigh = lastPrice;
    baseChartData[baseChartData.length - 1].forecastLow = lastPrice;

    for (let i = 1; i <= numPoints; i++) {
      const d = new Date(lastDate);
      if (period === '5y') d.setDate(d.getDate() + i * 30);
      else if (period === '1y') d.setDate(d.getDate() + i * 7);
      else if (period === '6mo') d.setDate(d.getDate() + i * 5);
      else d.setDate(d.getDate() + i * 2);

      const t = i / numPoints;
      baseChartData.push({
        date: d.toISOString().slice(0, 10),
        close: null as any,
        volume: null as any,
        forecastMean: lastPrice + (targetMean - lastPrice) * t,
        forecastHigh: lastPrice + (targetHigh - lastPrice) * t,
        forecastLow: lastPrice + (targetLow - lastPrice) * t,
      });
    }
  }

  const chartData = baseChartData;

  const metaParts = [q.exchange, q.sector, q.industry].filter(Boolean);
  const desc = (q as any).description || '';
  const shortDesc = desc.length > 250 ? desc.slice(0, 250) + '...' : desc;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-white tracking-tight leading-tight">{q.name || q.symbol}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs font-bold font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">{q.symbol}</span>
            {metaParts.length > 0 && <span className="text-xs text-gray-500">{metaParts.join(' \u2022 ')}</span>}
            {connected && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Live" />}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-3xl font-extrabold font-mono text-white tracking-tighter">${fmt(currentPrice)}</div>
          {change != null && changePct != null && (
            <div className={`text-sm font-semibold font-mono mt-0.5 ${pctColor(changePct)}`}>
              {change >= 0 ? '+' : ''}{fmt(change)} ({change >= 0 ? '+' : ''}{fmt(changePct)}%)
            </div>
          )}
        </div>
      </div>

      {/* Watchlist button */}
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

      {/* Company description */}
      {desc && (
        <div className="text-sm text-gray-400 leading-relaxed border-b border-[#1e2235] pb-5">
          {descExpanded ? desc : shortDesc}
          {desc.length > 250 && (
            <span onClick={() => setDescExpanded(!descExpanded)} className="text-blue-400 cursor-pointer font-medium ml-1 hover:underline">
              {descExpanded ? 'Show less' : 'Show more'}
            </span>
          )}
        </div>
      )}

      {/* ML Signals */}
      {snap && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <SignalCard label="Trend" value={snap.signals.trend.replace('_', ' ')}
            sub={`${(snap.signals.trend_confidence * 100).toFixed(0)}% confidence`}
            color={snap.signals.trend.includes('uptrend') ? 'text-emerald-400' : snap.signals.trend.includes('downtrend') ? 'text-red-400' : 'text-yellow-400'} />
          <SignalCard label="Anomaly Score" value={snap.signals.anomaly_score.toFixed(2)}
            sub={snap.signals.anomaly_flag ? 'ANOMALY DETECTED' : 'Normal'}
            color={snap.signals.anomaly_flag ? 'text-orange-400' : 'text-gray-300'} />
          <SignalCard label="Sentiment" value={snap.sentiment.label ?? (snap.sentiment.composite != null ? snap.sentiment.composite.toFixed(2) : '\u2014')}
            sub={snap.sentiment.method ? `via ${snap.sentiment.method}` : `${snap.sentiment.sample_size} sources`}
            color={snap.sentiment.composite != null ? (snap.sentiment.composite > 0.15 ? 'text-emerald-400' : snap.sentiment.composite < -0.15 ? 'text-red-400' : 'text-yellow-400') : 'text-gray-400'} />
          <SignalCard label="Volume" value={formatLargeNumber(snap.price.volume)} sub="Today" color="text-gray-300" />
        </div>
      )}

      {/* Period selector */}
      <div className="flex gap-1 bg-[#131620] rounded-lg p-1 w-fit">
        {PERIODS.map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${period === p ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}>
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
              <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00b464" stopOpacity={0.06} />
                <stop offset="100%" stopColor="#00b464" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2235" />
            <XAxis dataKey="date" tick={{ fill: '#4b5068', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis domain={['auto', 'auto']} tick={{ fill: '#4b5068', fontSize: 11 }} tickLine={false} axisLine={false} width={60} />
            <Tooltip contentStyle={{ background: '#131620', border: '1px solid #1e2235', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
              labelStyle={{ color: '#8b8fa3' }} itemStyle={{ color: '#e5e7eb' }} />
            <Area type="monotone" dataKey="close" stroke="#3b82f6" fill="url(#priceGradient)" strokeWidth={2} dot={false} connectNulls={false} />
            {showForecast && <>
              <Area type="monotone" dataKey="forecastHigh" stroke="rgba(0,180,100,0.4)" fill="url(#forecastFill)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls={false} name="Forecast High" />
              <Area type="monotone" dataKey="forecastLow" stroke="rgba(255,107,107,0.4)" fill="none" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls={false} name="Forecast Low" />
              <Area type="monotone" dataKey="forecastMean" stroke="#3b82f6" fill="none" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls={false} name="Target" />
            </>}
          </AreaChart>
        </ResponsiveContainer>
        {showForecast && (
          <div className="flex items-center gap-4 mt-2 ml-14 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-4 h-0 border-t-2 border-dashed border-blue-500 inline-block" /> Target ${fmt(targetMean)}</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-0 border-t border-dashed border-emerald-500/50 inline-block" /> High ${fmt(targetHigh)}</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-0 border-t border-dashed border-red-400/50 inline-block" /> Low ${fmt(targetLow)}</span>
          </div>
        )}
      </div>

      {/* Volume chart */}
      <div className="bg-[#131620] rounded-xl p-4 border border-[#1e2235]">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Volume</h3>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={chartData}>
            <XAxis dataKey="date" tick={false} axisLine={false} />
            <YAxis tick={{ fill: '#4b5068', fontSize: 10 }} tickLine={false} axisLine={false} width={60} />
            <Tooltip contentStyle={{ background: '#131620', border: '1px solid #1e2235', borderRadius: '8px' }}
              labelStyle={{ color: '#8b8fa3' }} />
            <Bar dataKey="volume" fill="#6366f1" opacity={0.5} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Analyst & Technical Ratings */}
      <div className="grid md:grid-cols-2 gap-5">
        <AnalystPanel quote={q} />
        <TechnicalPanel data={analysisData} />
      </div>

      {/* AI Overview */}
      <AIOverview quote={q} analysis={analysisData} />

      {/* Key Statistics */}
      <KeyStats quote={q} />

      {/* Insights */}
      {insights.length > 0 && (
        <section>
          <SectionTitle>Analysis Insights</SectionTitle>
          <div className="space-y-2">
            {insights.map((item, i) => (
              <div key={i} className="text-sm text-gray-400 leading-relaxed py-2.5 px-3.5 bg-[#131620] rounded-lg border-l-[3px] border-blue-500">{item}</div>
            ))}
          </div>
        </section>
      )}

      {/* News */}
      {articles.length > 0 && (
        <section>
          <SectionTitle>Recent News</SectionTitle>
          <div className="divide-y divide-[#1e2235]">
            {articles.map((a, i) => (
              <a key={i} href={a.link} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3.5 py-3 hover:bg-[#131620] transition-colors rounded-lg px-2 -mx-2">
                {a.thumbnail && /^https:\/\//.test(a.thumbnail) && (
                  <img src={a.thumbnail} alt="" className="w-[72px] h-12 rounded object-cover bg-[#131620] flex-shrink-0" loading="lazy" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-200 line-clamp-2">{a.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {a.publisher}{a.publishedAt ? ` \u2022 ${fmtDate(a.publishedAt)}` : ''}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ===== Sub-components ===== */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">{children}</h2>;
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

/* ----- Gauge SVG ----- */

function GaugeSVG({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  const cx = 90, cy = 85, r = 70;
  const colors = ['#ff4444', '#ff8c42', '#888899', '#66cc66', '#00b368'];
  const gap = 0.02;
  const segArc = (Math.PI - gap * 4) / 5;

  const arcs = colors.map((color, i) => {
    const a1 = Math.PI - i * (segArc + gap);
    const a2 = a1 - segArc;
    const x1 = cx + r * Math.cos(a1), y1 = cy - r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy - r * Math.sin(a2);
    return <path key={i} d={`M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`}
      fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" opacity="0.7" />;
  });

  const na = Math.PI - v * Math.PI;
  const nl = r - 16;
  const nx = cx + nl * Math.cos(na);
  const ny = cy - nl * Math.sin(na);

  return (
    <div className="flex flex-col items-center mb-3">
      <svg viewBox="0 0 180 100" className="w-[180px] h-[100px]" style={{ overflow: 'visible' }}>
        {arcs}
        <line x1={cx} y1={cy} x2={nx.toFixed(2) as any} y2={ny.toFixed(2) as any} stroke="#e2e8f0" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4" fill="#e2e8f0" />
      </svg>
    </div>
  );
}

function gaugeColor(v: number) {
  if (v >= 0.8) return '#00b368';
  if (v >= 0.6) return '#66cc66';
  if (v >= 0.4) return '#888899';
  if (v >= 0.2) return '#ff8c42';
  return '#ff4444';
}

function ratingLabel(rec: string, v: number) {
  if (rec === 'strong_buy') return 'Strong Buy';
  if (rec === 'buy') return 'Buy';
  if (rec === 'hold') return 'Hold';
  if (rec === 'sell' || rec === 'underperform') return 'Sell';
  if (rec === 'strong_sell') return 'Strong Sell';
  if (v >= 0.8) return 'Strong Buy';
  if (v >= 0.6) return 'Buy';
  if (v >= 0.4) return 'Hold';
  if (v >= 0.2) return 'Sell';
  return 'Strong Sell';
}

/* ----- Analyst Panel ----- */

function AnalystPanel({ quote: q }: { quote: api.QuoteData }) {
  const rec = (q as any).recommendationKey || '';
  const mean = (q as any).recommendationMean;
  const count = (q as any).numberOfAnalystOpinions || 0;
  const targetMean = (q as any).targetMeanPrice;
  const targetHigh = (q as any).targetHighPrice;
  const targetLow = (q as any).targetLowPrice;

  if (!rec && !mean && count === 0) {
    return <Panel title="Analyst Rating"><p className="text-sm text-gray-500">No analyst data available</p></Panel>;
  }

  let gaugeValue = 0.5;
  if (mean != null && mean > 0) gaugeValue = 1 - ((mean - 1) / 4);
  gaugeValue = Math.max(0, Math.min(1, gaugeValue));
  const label = ratingLabel(rec, gaugeValue);
  const color = gaugeColor(gaugeValue);

  const upside = targetMean != null && q.price != null && q.price > 0
    ? ((targetMean - q.price) / q.price * 100) : null;

  const reasons = analystReasons(q);

  return (
    <Panel title="Analyst Rating">
      <GaugeSVG value={gaugeValue} />
      <div className="text-center text-base font-extrabold" style={{ color }}>{label}</div>
      <div className="text-center text-xs text-gray-500 mt-0.5">{count} analyst{count !== 1 ? 's' : ''}</div>
      {targetMean != null && upside != null && (
        <div className="mt-3 space-y-1.5">
          <DetailRow label="Price Target" value={`$${fmt(targetMean)}`} />
          <DetailRow label="Upside" value={<span className={upside >= 0 ? 'text-emerald-400' : 'text-red-400'}>{upside >= 0 ? '+' : ''}{fmt(upside)}%</span>} />
          {targetHigh != null && <DetailRow label="High Target" value={`$${fmt(targetHigh)}`} />}
          {targetLow != null && <DetailRow label="Low Target" value={`$${fmt(targetLow)}`} />}
        </div>
      )}
      {reasons.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[#1e2235]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Why analysts say {label.toLowerCase()}</div>
          {reasons.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-gray-400 leading-relaxed mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function analystReasons(q: api.QuoteData): string[] {
  const reasons: string[] = [];
  const qAny = q as any;
  const price = q.price, target = qAny.targetMeanPrice;

  if (target != null && price != null && price > 0) {
    const upside = ((target - price) / price * 100);
    if (upside > 20) reasons.push(`Significant upside potential of ${fmt(upside)}% to consensus target of $${fmt(target)}`);
    else if (upside > 5) reasons.push(`Moderate upside of ${fmt(upside)}% to average price target of $${fmt(target)}`);
    else if (upside > -5) reasons.push(`Trading near analyst consensus target of $${fmt(target)}`);
    else reasons.push(`Trading ${fmt(Math.abs(upside))}% above analyst target of $${fmt(target)}, suggesting limited upside`);
  }

  if (qAny.revenueGrowth != null) {
    const rg = qAny.revenueGrowth * 100;
    if (rg > 15) reasons.push(`Strong revenue growth of ${fmt(rg)}% signals expanding business`);
    else if (rg > 0) reasons.push(`Positive revenue growth of ${fmt(rg)}%`);
    else if (rg < -5) reasons.push(`Revenue declining at ${fmt(rg)}%, a concern for growth outlook`);
  }

  if (qAny.earningsGrowth != null) {
    const eg = qAny.earningsGrowth * 100;
    if (eg > 20) reasons.push(`Earnings growth of ${fmt(eg)}% shows strong profitability trajectory`);
    else if (eg < -10) reasons.push(`Earnings contracting at ${fmt(eg)}%, pressuring valuation`);
  }

  if (qAny.peRatio != null && qAny.forwardPE != null && qAny.peRatio > 0 && qAny.forwardPE > 0) {
    if (qAny.forwardPE < qAny.peRatio * 0.85) reasons.push(`Forward P/E of ${fmt(qAny.forwardPE)} below trailing ${fmt(qAny.peRatio)}, implying expected earnings improvement`);
  }

  if (qAny.profitMargins != null) {
    const pm = qAny.profitMargins * 100;
    if (pm > 20) reasons.push(`High profit margins of ${fmt(pm)}% indicate pricing power`);
    else if (pm < 0) reasons.push(`Currently unprofitable with ${fmt(pm)}% margins`);
  }

  return reasons.slice(0, 5);
}

/* ----- Technical Panel ----- */

function TechnicalPanel({ data }: { data: api.AnalysisData | null }) {
  if (!data) {
    return <Panel title="Technical Analysis"><p className="text-sm text-gray-500">Loading technical data...</p></Panel>;
  }

  const signals: number[] = [];
  const rsi = data.currentRsi;
  if (rsi != null) {
    if (rsi < 30) signals.push(0.8);
    else if (rsi < 45) signals.push(0.65);
    else if (rsi < 55) signals.push(0.5);
    else if (rsi < 70) signals.push(0.35);
    else signals.push(0.15);
  }
  if (data.trend === 'uptrend') signals.push(0.85);
  else if (data.trend === 'downtrend') signals.push(0.15);
  else signals.push(0.5);

  const macdHist = data.macd?.histogram;
  if (macdHist && macdHist.length > 0) {
    const last = macdHist[macdHist.length - 1];
    if (last > 0) signals.push(0.75);
    else if (last < 0) signals.push(0.25);
    else signals.push(0.5);
  }
  if (data.periodReturn != null) {
    if (data.periodReturn > 10) signals.push(0.8);
    else if (data.periodReturn > 0) signals.push(0.6);
    else if (data.periodReturn > -10) signals.push(0.4);
    else signals.push(0.2);
  }

  const gaugeValue = signals.length > 0 ? signals.reduce((a, b) => a + b, 0) / signals.length : 0.5;
  const label = gaugeValue >= 0.75 ? 'Strong Buy' : gaugeValue >= 0.6 ? 'Buy' : gaugeValue >= 0.4 ? 'Neutral' : gaugeValue >= 0.25 ? 'Sell' : 'Strong Sell';
  const color = gaugeColor(gaugeValue);

  const trendSignal = (t: string) => t === 'uptrend' ? 'bullish' : t === 'downtrend' ? 'bearish' : 'neutral';
  const rsiSignal = (v: number) => v < 30 ? 'bullish' : v > 70 ? 'bearish' : 'neutral';

  return (
    <Panel title="Technical Analysis">
      <GaugeSVG value={gaugeValue} />
      <div className="text-center text-base font-extrabold" style={{ color }}>{label}</div>
      <div className="text-center text-xs text-gray-500 mt-0.5">Based on {signals.length} indicators</div>
      <div className="mt-3 space-y-0">
        <TechRow label="Trend" value={data.trend ? data.trend.charAt(0).toUpperCase() + data.trend.slice(1) : '--'} signal={trendSignal(data.trend)} />
        {rsi != null && <TechRow label="RSI (14)" value={fmt(rsi)} signal={rsiSignal(rsi)} />}
        {macdHist && macdHist.length > 0 && (
          <TechRow label="MACD" value={fmt(macdHist[macdHist.length - 1])} signal={macdHist[macdHist.length - 1] > 0 ? 'bullish' : macdHist[macdHist.length - 1] < 0 ? 'bearish' : 'neutral'} />
        )}
        <TechRow label="Volatility" value={data.volatility != null ? `${fmt(data.volatility)}%` : '--'} />
        <TechRow label="Period Return" value={data.periodReturn != null ? `${data.periodReturn >= 0 ? '+' : ''}${fmt(data.periodReturn)}%` : '--'}
          signal={data.periodReturn != null ? (data.periodReturn > 0 ? 'bullish' : data.periodReturn < 0 ? 'bearish' : 'neutral') : undefined} />
        {data.supportResistance && <>
          <TechRow label="Support" value={`$${fmt(data.supportResistance.support)}`} />
          <TechRow label="Resistance" value={`$${fmt(data.supportResistance.resistance)}`} />
        </>}
        {data.sma20 && data.sma20.length > 0 && <TechRow label="SMA 20" value={`$${fmt(data.sma20[data.sma20.length - 1])}`} />}
        {data.sma50 && data.sma50.length > 0 && <TechRow label="SMA 50" value={`$${fmt(data.sma50[data.sma50.length - 1])}`} />}
      </div>
    </Panel>
  );
}

/* ----- AI Overview ----- */

function AIOverview({ quote: q, analysis: a }: { quote: api.QuoteData; analysis: api.AnalysisData | null }) {
  const qAny = q as any;
  const paragraphs: string[] = [];

  const mcap = q.marketCap;
  let sizeLabel = 'company';
  if (mcap) {
    if (mcap >= 200e9) sizeLabel = 'mega-cap company';
    else if (mcap >= 10e9) sizeLabel = 'large-cap company';
    else if (mcap >= 2e9) sizeLabel = 'mid-cap company';
    else if (mcap >= 300e6) sizeLabel = 'small-cap company';
    else sizeLabel = 'micro-cap company';
  }

  paragraphs.push(`${q.name || q.symbol} (${q.symbol}) is a ${sizeLabel} in the ${q.sector || 'N/A'}${q.industry ? ' / ' + q.industry : ''} sector, currently trading at $${fmt(q.price)}.`);

  const high52 = qAny.fiftyTwoWeekHigh, low52 = qAny.fiftyTwoWeekLow;
  if (high52 != null && low52 != null && q.price != null) {
    const range = high52 - low52;
    const position = range > 0 ? ((q.price - low52) / range * 100) : 50;
    if (position > 85) paragraphs.push(`The stock is trading near its 52-week high of $${fmt(high52)}, indicating strong recent momentum but limited upside before hitting resistance.`);
    else if (position < 15) paragraphs.push(`The stock is near its 52-week low of $${fmt(low52)}, which could represent a value opportunity or a warning of continued deterioration.`);
    else paragraphs.push(`Trading at the ${Math.round(position)}th percentile of its 52-week range ($${fmt(low52)} \u2013 $${fmt(high52)}).`);
  }

  if (qAny.peRatio != null && qAny.peRatio > 0) {
    if (qAny.peRatio > 40) paragraphs.push(`At a P/E ratio of ${fmt(qAny.peRatio)}, the stock is priced for significant growth. Value investors may see it as overextended.`);
    else if (qAny.peRatio > 20) paragraphs.push(`The P/E ratio of ${fmt(qAny.peRatio)} suggests moderate valuation relative to earnings.`);
    else paragraphs.push(`With a P/E of ${fmt(qAny.peRatio)}, the stock appears reasonably valued.`);
  }

  if (a?.trend) {
    let tech = `Technically, the stock is in a${a.trend === 'uptrend' ? 'n uptrend' : a.trend === 'downtrend' ? ' downtrend' : ' sideways range'}`;
    if (a.currentRsi != null) {
      if (a.currentRsi > 70) tech += ` with RSI at ${fmt(a.currentRsi)} (overbought)`;
      else if (a.currentRsi < 30) tech += ` with RSI at ${fmt(a.currentRsi)} (oversold)`;
      else tech += ` with RSI at ${fmt(a.currentRsi)} (neutral)`;
    }
    paragraphs.push(tech + '.');
  }

  // Strategy
  let strategy = '';
  const target = qAny.targetMeanPrice;
  const price = q.price;
  const rec = qAny.recommendationKey || '';

  if (target != null && price != null && price > 0) {
    const upside = ((target - price) / price * 100);
    const support = a?.supportResistance?.support;
    const resistance = a?.supportResistance?.resistance;

    if (upside > 30 && (rec === 'buy' || rec === 'strong_buy')) {
      strategy = `Analysts see ${fmt(upside)}% upside to $${fmt(target)}. `;
      if (support) strategy += `Consider entries near support at $${fmt(support)}. `;
      strategy += 'This is a longer-term conviction play \u2014 consider a 6\u201312 month hold.';
    } else if (upside > 10) {
      strategy = `Consensus target of $${fmt(target)} implies ${fmt(upside)}% upside. `;
      if (support && resistance) strategy += `Support near $${fmt(support)}, resistance near $${fmt(resistance)}. `;
      strategy += 'A moderate position with a 3\u20136 month horizon could be appropriate.';
    } else if (upside > -5) {
      strategy = `Trading close to the analyst target of $${fmt(target)}. Most of the move may be priced in. `;
      strategy += 'Watch for catalysts before committing new capital.';
    } else {
      strategy = `Currently above consensus target of $${fmt(target)} by ${fmt(Math.abs(upside))}%. `;
      strategy += 'Consider trimming positions or setting stop-losses near support.';
    }
  } else if (a?.trend === 'uptrend') {
    strategy = 'The stock is in an uptrend. Look for pullbacks to moving averages as entry points.';
  } else if (a?.trend === 'downtrend') {
    strategy = 'The stock is in a downtrend. Wait for signs of reversal before entering.';
  }

  if (paragraphs.length === 0) return null;

  return (
    <section>
      <SectionTitle>Overview</SectionTitle>
      <div className="bg-[#131620] border border-[#1e2235] rounded-xl p-5">
        <div className="text-sm text-gray-400 leading-[1.7] space-y-3">
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        {strategy && (
          <div className="flex items-start gap-3 mt-4 p-3.5 bg-blue-500/5 border border-blue-500/20 rounded-lg text-sm text-gray-200 leading-relaxed">
            <span className="text-lg flex-shrink-0">💡</span>
            <div>{strategy}</div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ----- Key Statistics ----- */

function KeyStats({ quote: q }: { quote: api.QuoteData }) {
  const qAny = q as any;
  const stats: [string, string][] = [
    ['Market Cap', fmtLarge(q.marketCap)],
    ['P/E Ratio', fmt(qAny.peRatio)],
    ['Forward P/E', fmt(qAny.forwardPE)],
    ['EPS', qAny.eps != null ? `$${fmt(qAny.eps)}` : '--'],
    ['Volume', fmtLarge(q.volume)],
    ['Avg Volume', fmtLarge(qAny.avgVolume)],
    ['52W High', qAny.fiftyTwoWeekHigh != null ? `$${fmt(qAny.fiftyTwoWeekHigh)}` : '--'],
    ['52W Low', qAny.fiftyTwoWeekLow != null ? `$${fmt(qAny.fiftyTwoWeekLow)}` : '--'],
    ['Open', qAny.open != null ? `$${fmt(qAny.open)}` : '--'],
    ['Day High', qAny.dayHigh != null ? `$${fmt(qAny.dayHigh)}` : '--'],
    ['Day Low', qAny.dayLow != null ? `$${fmt(qAny.dayLow)}` : '--'],
    ['Beta', fmt(qAny.beta)],
    ['Dividend Yield', qAny.dividendYield != null ? `${fmt(qAny.dividendYield)}%` : '--'],
    ['Price/Book', fmt(qAny.priceToBook)],
    ['Profit Margin', qAny.profitMargins != null ? `${fmt(qAny.profitMargins * 100)}%` : '--'],
    ['Debt/Equity', fmt(qAny.debtToEquity)],
  ];

  // Don't show section if all values are empty
  if (stats.every(([, v]) => v === '--')) return null;

  return (
    <section>
      <SectionTitle>Key Statistics</SectionTitle>
      <div className="grid grid-cols-2 divide-y divide-[#1e2235]">
        {stats.map(([label, value], i) => (
          <div key={label} className={`flex justify-between items-center py-2 text-sm ${i % 2 === 1 ? 'pl-5 border-l border-[#1e2235]' : 'pr-5'}`}>
            <span className="text-gray-400">{label}</span>
            <span className="font-semibold font-mono text-sm text-gray-200">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ----- Small shared components ----- */

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#131620] border border-[#1e2235] rounded-xl p-5">
      <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">{title}</div>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-sm py-1">
      <span className="text-gray-400">{label}</span>
      <span className="font-semibold font-mono text-sm text-gray-200">{value}</span>
    </div>
  );
}

function TechRow({ label, value, signal }: { label: string; value: string; signal?: string }) {
  return (
    <div className="flex justify-between items-center text-sm py-1.5 border-b border-[#1e2235] last:border-b-0">
      <span className="text-gray-400">{label}</span>
      <span className="font-semibold font-mono text-sm text-gray-200">
        {value}
        {signal && (
          <span className={`ml-2 inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${
            signal === 'bullish' ? 'bg-emerald-500/10 text-emerald-400' :
            signal === 'bearish' ? 'bg-red-500/10 text-red-400' :
            'bg-blue-500/10 text-gray-400'
          }`}>{signal}</span>
        )}
      </span>
    </div>
  );
}

function DetailSkeleton(_props: { symbol?: string }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="skeleton h-7 w-52" />
        <div className="skeleton h-5 w-36 mt-2" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
      </div>
      <div className="skeleton h-8 w-64 rounded-lg" />
      <div className="skeleton h-80 rounded-xl" />
      <div className="skeleton h-28 rounded-xl" />
      <div className="grid md:grid-cols-2 gap-5">
        <div className="skeleton h-64 rounded-xl" />
        <div className="skeleton h-64 rounded-xl" />
      </div>
    </div>
  );
}

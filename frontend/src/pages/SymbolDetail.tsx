/**
 * SymbolDetail — per-ticker page.
 *
 * Owns data fetching and layout. Presentational concerns live in
 * ``components/symbol/*``, which keeps this file focused on the state
 * machine (loading / error / ready) and the composition of panels.
 *
 * Data flow:
 *   1. ``loadData`` fetches the critical path (quote, snapshot, history)
 *      in parallel and updates the loading flag only when all four settle.
 *   2. Non-critical enrichments (analysis, interpret, news) are fetched in
 *      the background and render progressively as they arrive.
 *   3. A WebSocket subscription overlays real-time price + change %.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LineStyle } from 'lightweight-charts';

import * as api from '../lib/api';
import { pctColor } from '../lib/format';
import { useWebSocket } from '../hooks/useWebSocket';
import CandlestickChart, {
  type ChartType,
  type ForecastConfig,
  type OHLCVData,
  type PriceLineConfig,
} from '../components/CandlestickChart';
import OrderBook from '../components/OrderBook';
import { computeIndicators, type IndicatorState } from '../lib/indicators';

import AIOverview from '../components/symbol/AIOverview';
import AnalystPanel from '../components/symbol/AnalystPanel';
import DetailSkeleton from '../components/symbol/DetailSkeleton';
import InsightsPanel from '../components/symbol/InsightsPanel';
import KeyStats from '../components/symbol/KeyStats';
import NewsPanel from '../components/symbol/NewsPanel';
import SignalCards from '../components/symbol/SignalCards';
import TechnicalPanel from '../components/symbol/TechnicalPanel';
import { fmt } from '../components/symbol/shared';

const PERIODS = ['1d', '5d', '1mo', '6mo', '1y', '5y'] as const;
const FORECAST_PERIODS = new Set(['1mo', '6mo', '1y', '5y']);
const INDICATOR_TOGGLES: [keyof IndicatorState, string, string][] = [
  ['fvg', 'FVG', 'Fair Value Gaps'],
  ['volumeAnomalies', 'Vol', 'Volume Anomalies'],
  ['orderBlocks', 'OB', 'Order Blocks'],
];

function buildForecastLines(
  showForecast: boolean,
  targetMean: number | null | undefined,
  targetHigh: number | null | undefined,
  targetLow: number | null | undefined,
): PriceLineConfig[] {
  if (!showForecast || targetMean == null) return [];
  const lines: PriceLineConfig[] = [
    { id: 'target-mean', price: targetMean, color: '#3b82f6', title: `Target $${fmt(targetMean)}`, lineStyle: LineStyle.Dashed, lineWidth: 2 },
  ];
  if (targetHigh) lines.push({ id: 'target-high', price: targetHigh, color: '#10b981', title: `High $${fmt(targetHigh)}`, lineStyle: LineStyle.Dotted, lineWidth: 1 });
  if (targetLow) lines.push({ id: 'target-low', price: targetLow, color: '#ef4444', title: `Low $${fmt(targetLow)}`, lineStyle: LineStyle.Dotted, lineWidth: 1 });
  return lines;
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
  const [chartType, setChartType] = useState<ChartType>('area');
  const [indicators, setIndicators] = useState<IndicatorState>({ fvg: false, volumeAnomalies: false, orderBlocks: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inWatchlist, setInWatchlist] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showBookMobile, setShowBookMobile] = useState(false);
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

      api.analysis(symbol, period).then(setAnalysisData).catch(() => {});
      api.interpret(symbol).then((d) => setInsights(d.insights || [])).catch(() => {});
      api.news(symbol).then((d) => setArticles(d.articles || [])).catch(() => {});
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [symbol, period]);

  useEffect(() => { loadData(); }, [loadData]);

  const chartData: OHLCVData[] = useMemo(() => {
    if (!hist) return [];
    return hist.dates.map((d, i) => ({
      time: d,
      open: hist.opens[i] ?? hist.closes[i],
      high: hist.highs[i] ?? hist.closes[i],
      low: hist.lows[i] ?? hist.closes[i],
      close: hist.closes[i],
      volume: hist.volumes[i],
    }));
  }, [hist]);

  const { boxes: indicatorBoxes, markers: indicatorMarkers } = useMemo(
    () => computeIndicators(chartData, indicators),
    [chartData, indicators],
  );

  const toggleWatchlist = async () => {
    if (!symbol) return;
    try {
      await api.updateWatchlist(symbol, inWatchlist ? 'remove' : 'add');
      setInWatchlist(!inWatchlist);
    } catch { /* swallow — watchlist is best-effort */ }
  };

  if (loading) return <DetailSkeleton />;
  if (error) return <div className="text-red-400 text-center py-20">Error: {error}</div>;
  if (!quoteData || !hist) return null;

  const q = quoteData;
  const qAny = q as any;
  const currentPrice = liveData?.price ?? q.price ?? 0;
  const changePct = liveData?.change_pct ?? q.changePercent;
  const change = q.change;

  const targetMean = qAny.targetMeanPrice;
  const targetHigh = qAny.targetHighPrice;
  const targetLow = qAny.targetLowPrice;
  const showForecast = !!(targetMean && FORECAST_PERIODS.has(period));

  const forecastConfig: ForecastConfig | undefined = showForecast
    ? { targetMean, targetHigh: targetHigh ?? undefined, targetLow: targetLow ?? undefined }
    : undefined;
  const forecastLines = buildForecastLines(showForecast, targetMean, targetHigh, targetLow);

  const metaParts = [q.exchange, q.sector, q.industry].filter(Boolean);
  const desc = qAny.description || '';
  const shortDesc = desc.length > 250 ? desc.slice(0, 250) + '...' : desc;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)] tracking-tight leading-tight">{q.name || q.symbol}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs font-bold font-mono text-[var(--accent)] bg-[var(--accent-soft)] px-2 py-0.5 rounded">{q.symbol}</span>
            {metaParts.length > 0 && <span className="text-xs text-[var(--text-muted)]">{metaParts.join(' \u2022 ')}</span>}
            {connected && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Live" />}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-3xl font-extrabold font-mono text-[var(--text-primary)] tracking-tighter">${fmt(currentPrice)}</div>
          {change != null && changePct != null && (
            <div className={`text-sm font-semibold font-mono mt-0.5 ${pctColor(changePct)}`}>
              {change >= 0 ? '+' : ''}{fmt(change)} ({change >= 0 ? '+' : ''}{fmt(changePct)}%)
            </div>
          )}
        </div>
      </div>

      <button
        onClick={toggleWatchlist}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          inWatchlist
            ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/30'
            : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]'
        }`}
      >
        {inWatchlist ? 'In Watchlist' : '+ Watchlist'}
      </button>

      {desc && (
        <div className="text-sm text-[var(--text-secondary)] leading-relaxed border-b border-[var(--border)] pb-5">
          {descExpanded ? desc : shortDesc}
          {desc.length > 250 && (
            <span onClick={() => setDescExpanded(!descExpanded)} className="text-[var(--accent)] cursor-pointer font-medium ml-1 hover:underline">
              {descExpanded ? 'Show less' : 'Show more'}
            </span>
          )}
        </div>
      )}

      {snap && <SignalCards snap={snap} />}

      {/* Chart controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-0.5 bg-[var(--bg-card)] rounded-xl p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${period === p ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 bg-[var(--bg-card)] rounded-xl p-1">
            {([['area', 'Line'], ['candlestick', 'Candles']] as [ChartType, string][]).map(([type, label]) => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${chartType === type ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="hidden md:flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold mr-1">Indicators</span>
            {INDICATOR_TOGGLES.map(([key, label, title]) => (
              <button
                key={key}
                title={title}
                onClick={() => setIndicators((prev) => ({ ...prev, [key]: !prev[key] }))}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all ${
                  indicators[key]
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setFocusMode((v) => !v)}
            title={focusMode ? 'Show all sections' : 'Focus on chart only'}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all flex items-center gap-1 ${
              focusMode
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)]'
            }`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
            Focus
          </button>
        </div>
      </div>

      {/* Chart + Order Book */}
      <div className="flex gap-4 flex-col xl:flex-row">
        <div className="flex-1 min-w-0 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
          <CandlestickChart
            data={chartData}
            chartType={chartType}
            priceLines={forecastLines}
            forecast={forecastConfig}
            boxes={indicatorBoxes}
            markers={indicatorMarkers}
            height={focusMode ? 620 : 420}
            showVolume={true}
          />
          {forecastLines.length > 0 && (
            <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--border)] text-[11px] text-[var(--text-muted)]">
              <span className="flex items-center gap-1.5"><span className="w-4 h-0 border-t-2 border-dashed border-blue-500 inline-block" /> Target ${fmt(targetMean)}</span>
              {targetHigh && <span className="flex items-center gap-1.5"><span className="w-4 h-0 border-t border-dashed border-emerald-500/50 inline-block" /> High ${fmt(targetHigh)}</span>}
              {targetLow && <span className="flex items-center gap-1.5"><span className="w-4 h-0 border-t border-dashed border-red-400/50 inline-block" /> Low ${fmt(targetLow)}</span>}
            </div>
          )}
        </div>
        <div className="xl:w-64 shrink-0">
          <div className="xl:hidden">
            <button
              onClick={() => setShowBookMobile((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <span className="uppercase tracking-wider">Order Book</span>
              <svg className={`w-4 h-4 transition-transform ${showBookMobile ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showBookMobile && <div className="mt-2"><OrderBook symbol={q.symbol} levels={10} /></div>}
          </div>
          <div className="hidden xl:block">
            <OrderBook symbol={q.symbol} levels={10} />
          </div>
        </div>
      </div>

      {!focusMode && (
        <>
          <div className="grid md:grid-cols-2 gap-5">
            <AnalystPanel quote={q} />
            <TechnicalPanel data={analysisData} />
          </div>
          <AIOverview quote={q} analysis={analysisData} />
          <KeyStats quote={q} />
          <InsightsPanel insights={insights} />
          <NewsPanel articles={articles} />
        </>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../lib/api';
import CandlestickChart, { type OHLCVData } from '../components/CandlestickChart';
import type { ChartBox, ChartMarker } from '../lib/indicators';
import { useTabStore } from '../stores/tabStore';

const DEFAULT_SYMBOL = 'NVDA';
const PERIODS: ('1mo' | '6mo' | '1y')[] = ['1mo', '6mo', '1y'];

const FEATURE_LABELS: Record<string, { label: string; description: string }> = {
  price_change_pct: {
    label: 'Price Change %',
    description: 'Bar-over-bar percent change in close. Big positive or negative jumps stand out.',
  },
  volume_ratio: {
    label: 'Volume Ratio',
    description: 'Today\'s volume divided by the 20-bar average. Above ~2× signals unusual interest.',
  },
  volatility: {
    label: 'Volatility',
    description: 'Annualized 10-bar rolling standard deviation of returns. Spikes mean choppy action.',
  },
};

function isoToChartTime(iso: string, interval: string): string {
  // lightweight-charts wants "YYYY-MM-DD" for daily/weekly, "YYYY-MM-DD HH:MM" for intraday.
  const [datePart, timePartFull] = iso.split('T');
  if (!timePartFull || interval === '1d' || interval === '1wk') return datePart;
  const timePart = timePartFull.slice(0, 5); // HH:MM
  return `${datePart} ${timePart}`;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function Anomalies() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [pendingSymbol, setPendingSymbol] = useState(DEFAULT_SYMBOL);
  const [period, setPeriod] = useState<'1mo' | '6mo' | '1y'>('6mo');
  const [scan, setScan] = useState<api.AnomalyScanData | null>(null);
  const [scanLoading, setScanLoading] = useState(true);
  const [scanError, setScanError] = useState('');
  const [explainerOpen, setExplainerOpen] = useState(true);
  const [feed, setFeed] = useState<api.AnomaliesData | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  // Run scan when symbol/period change
  useEffect(() => {
    let cancelled = false;
    setScanLoading(true);
    setScanError('');
    api.anomalyScan(symbol, period)
      .then((d) => { if (!cancelled) { setScan(d); setSelectedEvent(d.events[0]?.date ?? null); } })
      .catch((e: any) => { if (!cancelled) setScanError(e.message || 'Scan failed'); })
      .finally(() => { if (!cancelled) setScanLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, period]);

  // Cross-symbol feed (background)
  useEffect(() => {
    api.anomalies(50)
      .then(setFeed)
      .catch(() => setFeed({ anomalies: [], count: 0 }));
  }, []);

  // Build chart data (memoized)
  const chartData: OHLCVData[] = useMemo(() => {
    if (!scan) return [];
    return scan.bars.map((b) => ({
      time: isoToChartTime(b.date, scan.interval),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));
  }, [scan]);

  // Anomaly markers (one per detected event)
  const markers: ChartMarker[] = useMemo(() => {
    if (!scan) return [];
    return scan.events.map((e) => ({
      time: isoToChartTime(e.date, scan.interval),
      position: 'aboveBar' as const,
      color: '#fb923c',
      shape: 'circle' as const,
      text: `${(e.score * 100).toFixed(0)}%`,
    }));
  }, [scan]);

  // Anomaly highlight boxes — span ±1 bar around each event so it's visible
  const boxes: ChartBox[] = useMemo(() => {
    if (!scan || scan.bars.length === 0) return [];
    const bars = scan.bars;
    const eventBoxes: ChartBox[] = [];
    for (const ev of scan.events) {
      const idx = bars.findIndex((b) => b.date === ev.date);
      if (idx < 0) continue;
      const startIdx = Math.max(0, idx - 1);
      const endIdx = Math.min(bars.length - 1, idx + 1);
      const high = Math.max(...bars.slice(startIdx, endIdx + 1).map((b) => b.high));
      const low = Math.min(...bars.slice(startIdx, endIdx + 1).map((b) => b.low));
      const isSelected = ev.date === selectedEvent;
      eventBoxes.push({
        id: `anomaly-${ev.date}`,
        startTime: isoToChartTime(bars[startIdx].date, scan.interval),
        endTime: isoToChartTime(bars[endIdx].date, scan.interval),
        high,
        low,
        color: isSelected ? 'rgba(251, 146, 60, 0.22)' : 'rgba(251, 146, 60, 0.10)',
        label: 'Anomaly',
        type: 'fvg',
      });
    }
    return eventBoxes;
  }, [scan, selectedEvent]);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pendingSymbol.trim().toUpperCase();
    if (trimmed && trimmed !== symbol) setSymbol(trimmed);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Anomaly Detector</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Isolation Forest scan over recent price &amp; volume history. Orange markers flag bars whose
            features sit far from the rest of the distribution.
          </p>
        </div>
        <button
          onClick={() => setExplainerOpen((v) => !v)}
          className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          {explainerOpen ? 'Hide' : 'Show'} explainer
        </button>
      </div>

      {/* Explainer card */}
      {explainerOpen && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--accent)]">How this works</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed">
              An <span className="font-semibold text-[var(--text-primary)]">Isolation Forest</span> is an
              unsupervised ML model that builds many random binary trees over the data. Points that get
              isolated in just a few splits are flagged as anomalous because they sit far from the
              dense regions where most of the data lives. We refit the model each scan, so it adapts
              to the symbol&apos;s recent behavior rather than comparing against a fixed baseline.
            </p>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">What we feed it</h3>
            <div className="grid sm:grid-cols-3 gap-3 mt-2">
              {Object.entries(FEATURE_LABELS).map(([key, info]) => (
                <div key={key} className="bg-[var(--bg-primary)] rounded-xl p-3 border border-[var(--border)]">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">{info.label}</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">{info.description}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            <span className="font-semibold text-[var(--text-secondary)]">How to read the chart:</span> orange
            circles mark detected anomaly bars. The shaded box behind a marker spans the bar plus its
            neighbors so the context is easy to spot. Click an event below to highlight it on the chart.
            A score above {scan?.thresholds.flag ?? 0.7} flags an anomaly.
          </div>
        </div>
      )}

      {/* Scan controls */}
      <form onSubmit={handleScan} className="flex flex-wrap items-end gap-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4">
        <div>
          <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block mb-1">Symbol</label>
          <input
            type="text"
            value={pendingSymbol}
            onChange={(e) => setPendingSymbol(e.target.value.toUpperCase())}
            className="w-28 bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div>
          <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block mb-1">Period</label>
          <div className="flex gap-0.5 bg-[var(--bg-primary)] rounded-xl p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  period === p
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={scanLoading}
          className="px-5 py-2 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {scanLoading ? 'Scanning...' : 'Scan'}
        </button>
      </form>

      {/* Scan results */}
      {scanError && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
          {scanError}
        </div>
      )}

      {scanLoading && !scan && (
        <div className="space-y-3">
          <div className="skeleton h-12 rounded-xl" />
          <div className="skeleton h-72 rounded-2xl" />
          <div className="skeleton h-32 rounded-2xl" />
        </div>
      )}

      {scan && !scanLoading && (
        <>
          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[var(--border)] rounded-2xl overflow-hidden">
            <Stat label="Symbol" value={scan.symbol} />
            <Stat label="Bars Scanned" value={scan.scores.length.toString()} />
            <Stat label="Anomalies" value={scan.events.length.toString()} accent />
            <Stat label="Threshold" value={`${(scan.thresholds.flag * 100).toFixed(0)}%`} />
          </div>

          {/* Chart */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden">
            <CandlestickChart
              data={chartData}
              chartType="candlestick"
              boxes={boxes}
              markers={markers}
              height={420}
              showVolume={true}
            />
          </div>

          {/* Events list */}
          {scan.events.length === 0 ? (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-8 text-center">
              <div className="text-sm font-semibold text-[var(--text-primary)]">No anomalies detected</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">
                The Isolation Forest didn&apos;t flag any bars in this window. Try a longer period or another symbol.
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-3">
                Detected Events ({scan.events.length})
              </h2>
              <div className="space-y-2">
                {scan.events.map((ev) => (
                  <EventRow
                    key={ev.date}
                    event={ev}
                    selected={ev.date === selectedEvent}
                    onSelect={() => setSelectedEvent(ev.date)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Cross-symbol feed */}
      {feed && feed.count > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-3 mt-6">
            Recent Anomalies Across Watchlist
          </h2>
          <div className="space-y-1.5">
            {feed.anomalies.slice(0, 10).map((a, i) => (
              <Link
                key={`${a.symbol}-${i}`}
                to={`/symbol/${a.symbol}`}
                onClick={() => useTabStore.getState().openTab(a.symbol)}
                className="flex items-center justify-between bg-[var(--bg-card)] rounded-xl border border-[var(--border)] hover:border-orange-500/40 px-4 py-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-[var(--text-primary)] font-mono">{a.symbol}</span>
                  <span className="text-orange-400 text-xs font-mono">
                    {(a.anomaly_score * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-[var(--text-muted)] font-mono">
                  {a.price_change_pct != null && (
                    <span className={a.price_change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {a.price_change_pct >= 0 ? '+' : ''}{a.price_change_pct.toFixed(2)}%
                    </span>
                  )}
                  {a.volume_ratio != null && <span>{a.volume_ratio.toFixed(1)}× vol</span>}
                  <span className="hidden sm:inline">{new Date(a.detected_at).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-[var(--bg-card)] px-4 py-3">
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{label}</div>
      <div className={`text-base font-bold font-mono mt-0.5 ${accent ? 'text-orange-400' : 'text-[var(--text-primary)]'}`}>
        {value}
      </div>
    </div>
  );
}

function EventRow({ event, selected, onSelect }: {
  event: api.AnomalyEvent;
  selected: boolean;
  onSelect: () => void;
}) {
  const driver = FEATURE_LABELS[event.dominant_feature]?.label ?? event.dominant_feature;
  const driverDesc = FEATURE_LABELS[event.dominant_feature]?.description ?? '';

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left bg-[var(--bg-card)] rounded-2xl border transition-all ${
        selected
          ? 'border-orange-500/50 ring-1 ring-orange-500/20'
          : 'border-[var(--border)] hover:border-[var(--border-hover,var(--border))]'
      }`}
    >
      <div className="flex items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400 font-bold font-mono text-xs shrink-0">
            {(event.score * 100).toFixed(0)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--text-primary)]">{fmtDate(event.date)}</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">
              Close <span className="font-mono text-[var(--text-secondary)]">${event.close.toFixed(2)}</span>
              {' '}· Driver: <span className="text-orange-300 font-medium">{driver}</span>
              {' '}<span className="font-mono">(z = {event.dominant_z.toFixed(2)})</span>
            </div>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono text-[var(--text-muted)]">
          {Object.entries(event.features).map(([k, v]) => (
            <div key={k} className="text-right">
              <div className="text-[9px] uppercase tracking-wider">{FEATURE_LABELS[k]?.label ?? k}</div>
              <div className="text-[var(--text-secondary)]">{formatFeatureValue(k, v)}</div>
            </div>
          ))}
        </div>
      </div>
      {selected && driverDesc && (
        <div className="px-4 pb-4 text-[11px] text-[var(--text-muted)] leading-relaxed border-t border-[var(--border)] pt-3">
          <span className="font-semibold text-[var(--text-secondary)]">Why flagged:</span> {driverDesc}
        </div>
      )}
    </button>
  );
}

function formatFeatureValue(key: string, value: number): string {
  if (key === 'price_change_pct') return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  if (key === 'volume_ratio') return `${value.toFixed(2)}×`;
  if (key === 'volatility') return `${value.toFixed(1)}%`;
  return value.toFixed(2);
}

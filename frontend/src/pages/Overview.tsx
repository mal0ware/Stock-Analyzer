import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../lib/api';
import { formatPct, pctColor } from '../lib/format';
import { useTabStore } from '../stores/tabStore';

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

  // Compute aggregate market stats
  const sectorsWithData = data.sectors.filter((s) => s.change_pct != null);
  const avgSectorChange = sectorsWithData.length > 0
    ? sectorsWithData.reduce((sum, s) => sum + (s.change_pct ?? 0), 0) / sectorsWithData.length
    : 0;
  const advancingSectors = sectorsWithData.filter((s) => (s.change_pct ?? 0) >= 0).length;
  const decliningSectors = sectorsWithData.length - advancingSectors;
  const bestSector = [...sectorsWithData].sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0))[0];
  const worstSector = [...sectorsWithData].sort((a, b) => (a.change_pct ?? 0) - (b.change_pct ?? 0))[0];

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">
            Market Overview
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Real-time sector performance and top movers
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Live
        </div>
      </div>

      {/* Market Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[var(--border)] rounded-xl overflow-hidden">
        <div className="bg-[var(--bg-card)] px-4 py-3">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Avg Sector</div>
          <div className={`text-lg font-bold font-mono ${avgSectorChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {avgSectorChange >= 0 ? '+' : ''}{avgSectorChange.toFixed(2)}%
          </div>
        </div>
        <div className="bg-[var(--bg-card)] px-4 py-3">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Breadth</div>
          <div className="text-lg font-bold font-mono text-[var(--text-primary)]">
            <span className="text-emerald-400">{advancingSectors}</span>
            <span className="text-[var(--text-muted)] text-sm mx-1">/</span>
            <span className="text-red-400">{decliningSectors}</span>
          </div>
          <div className="text-[10px] text-[var(--text-muted)]">up / down</div>
        </div>
        <div className="bg-[var(--bg-card)] px-4 py-3">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Best Sector</div>
          <div className="text-sm font-semibold text-emerald-400 truncate">{bestSector?.sector ?? '--'}</div>
          <div className="text-[10px] text-emerald-400/70 font-mono">{formatPct(bestSector?.change_pct)}</div>
        </div>
        <div className="bg-[var(--bg-card)] px-4 py-3">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Worst Sector</div>
          <div className="text-sm font-semibold text-red-400 truncate">{worstSector?.sector ?? '--'}</div>
          <div className="text-[10px] text-red-400/70 font-mono">{formatPct(worstSector?.change_pct)}</div>
        </div>
      </div>

      {/* Sector Heatmap */}
      <section>
        <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-4">
          Sectors
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {data.sectors.map((s) => (
            <SectorCard key={s.etf} sector={s} />
          ))}
        </div>
      </section>

      {/* Top Movers */}
      <div className="grid lg:grid-cols-2 gap-6">
        <MoverSection
          title="Top Gainers"
          movers={data.movers.gainers}
          color="emerald"
        />
        <MoverSection
          title="Top Losers"
          movers={data.movers.losers}
          color="red"
        />
      </div>

      {/* Quick Links */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Link to="/watchlist" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 hover:bg-[var(--bg-card-hover)] hover:shadow-lg hover:shadow-black/5 transition-all group">
          <div className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">Watchlist</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Track your favorite symbols</div>
        </Link>
        <Link to="/simulator" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 hover:bg-[var(--bg-card-hover)] hover:shadow-lg hover:shadow-black/5 transition-all group">
          <div className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">Simulator</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Backtest trading strategies</div>
        </Link>
        <Link to="/anomalies" className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 hover:bg-[var(--bg-card-hover)] hover:shadow-lg hover:shadow-black/5 transition-all group">
          <div className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">Anomalies</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">ML-detected unusual activity</div>
        </Link>
      </div>
    </div>
  );
}

function SectorCard({ sector: s }: { sector: api.MarketOverviewData['sectors'][0] }) {
  const ref = useRef<HTMLDivElement>(null);
  const rectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const cacheRect = () => { rectRef.current = el.getBoundingClientRect(); };
    cacheRect();

    const onMove = (e: MouseEvent) => {
      const r = rectRef.current;
      if (!r) return;
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(800px) rotateX(${-y * 6}deg) rotateY(${x * 6}deg) scale(1.02)`;
      el.style.setProperty('--spotlight-x', `${e.clientX - r.left}px`);
      el.style.setProperty('--spotlight-y', `${e.clientY - r.top}px`);
    };

    const onEnter = () => { rectRef.current = el.getBoundingClientRect(); };

    const onLeave = () => {
      el.style.transition = 'transform 0.4s ease-out';
      el.style.transform = 'perspective(800px) rotateX(0) rotateY(0) scale(1)';
      setTimeout(() => { el.style.transition = ''; }, 400);
    };

    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    window.addEventListener('scroll', cacheRect, { passive: true });
    window.addEventListener('resize', cacheRect, { passive: true });
    return () => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('scroll', cacheRect);
      window.removeEventListener('resize', cacheRect);
    };
  }, []);

  const isUp = s.change_pct != null && s.change_pct >= 0;
  const isDown = s.change_pct != null && s.change_pct < 0;
  const intensity = Math.min(Math.abs(s.change_pct ?? 0) / 3, 1);

  const openTab = useTabStore((st) => st.openTab);

  return (
    <Link
      to={`/symbol/${s.etf}`}
      onClick={() => openTab(s.etf)}
      ref={ref as any}
      className="spotlight-card group relative rounded-xl p-4 border cursor-pointer overflow-hidden block"
      style={{
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        borderColor: isUp
          ? `rgba(16, 185, 129, ${0.15 + intensity * 0.3})`
          : isDown
            ? `rgba(239, 68, 68, ${0.15 + intensity * 0.3})`
            : 'var(--border)',
        background: isUp
          ? `linear-gradient(135deg, rgba(16, 185, 129, ${0.03 + intensity * 0.08}), rgba(16, 185, 129, ${0.01 + intensity * 0.04}))`
          : isDown
            ? `linear-gradient(135deg, rgba(239, 68, 68, ${0.03 + intensity * 0.08}), rgba(239, 68, 68, ${0.01 + intensity * 0.04}))`
            : 'var(--bg-card)',
      }}
    >
      <div className="text-xs text-[var(--text-secondary)] font-medium truncate">{s.sector}</div>
      <div className="flex items-baseline gap-2 mt-2">
        <div className="text-xl font-bold text-[var(--text-primary)] font-mono tabular-nums">
          {s.price != null ? `$${s.price.toFixed(2)}` : '\u2014'}
        </div>
        <div className="text-[10px] text-[var(--text-muted)] font-mono">{s.etf}</div>
      </div>
      <div className={`text-sm font-semibold mt-1 ${pctColor(s.change_pct)}`}>
        {formatPct(s.change_pct)}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{
        background: isUp
          ? `rgba(16, 185, 129, ${0.3 + intensity * 0.5})`
          : isDown
            ? `rgba(239, 68, 68, ${0.3 + intensity * 0.5})`
            : 'transparent',
      }} />
    </Link>
  );
}

function MoverSection({ title, movers, color }: {
  title: string;
  movers: api.MarketMover[];
  color: 'emerald' | 'red';
}) {
  const headerColor = color === 'emerald' ? 'text-emerald-400' : 'text-red-400';
  const dotColor = color === 'emerald' ? 'bg-emerald-400' : 'bg-red-400';
  const openTab = useTabStore((s) => s.openTab);

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[var(--border)]">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <h2 className={`text-sm font-semibold ${headerColor} uppercase tracking-wider`}>{title}</h2>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {movers.map((m, i) => (
          <Link
            key={m.symbol}
            to={`/symbol/${m.symbol}`}
            onClick={() => openTab(m.symbol)}
            className="flex items-center justify-between px-5 py-3 hover:bg-[var(--bg-card-hover)] transition-colors group"
          >
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--text-muted)] w-5 font-mono">{i + 1}</span>
              <span className="font-semibold text-[var(--text-primary)] text-sm group-hover:text-[var(--accent)] transition-colors">
                {m.symbol}
              </span>
            </div>
            <div className="flex items-center gap-5">
              <span className="text-[var(--text-secondary)] text-sm font-mono tabular-nums">
                ${m.price.toFixed(2)}
              </span>
              <span className={`text-sm font-bold min-w-[72px] text-right font-mono tabular-nums ${pctColor(m.change_pct)}`}>
                {formatPct(m.change_pct)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-8">
      <div>
        <div className="skeleton h-9 w-56" />
        <div className="skeleton h-4 w-80 mt-2" />
      </div>
      <section>
        <div className="skeleton h-3 w-16 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      </section>
      <div className="grid lg:grid-cols-2 gap-6">
        {[0, 1].map((col) => (
          <div key={col} className="skeleton h-72 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
        <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      </div>
      <div className="text-red-400 font-medium">Failed to load market data</div>
      <div className="text-[var(--text-muted)] text-sm">{message}</div>
    </div>
  );
}

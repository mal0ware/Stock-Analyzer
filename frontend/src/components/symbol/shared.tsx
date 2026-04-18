/**
 * Shared primitives and formatters for SymbolDetail panels.
 *
 * Kept colocated with the panels that consume them so the page-level
 * components stay focused on composition rather than presentational details.
 */

import React from 'react';

export function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n as number)) return '--';
  return Number(n).toFixed(2);
}

export function fmtLarge(n: number | null | undefined): string {
  if (n == null) return '--';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

export function fmtDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const diffH = Math.floor((Date.now() - d.getTime()) / 3_600_000);
    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function gaugeColor(v: number): string {
  if (v >= 0.8) return '#00b368';
  if (v >= 0.6) return '#66cc66';
  if (v >= 0.4) return '#888899';
  if (v >= 0.2) return '#ff8c42';
  return '#ff4444';
}

export function ratingLabel(rec: string, v: number): string {
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

export const SectionTitle = React.memo(function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-3">{children}</h2>;
});

export const Panel = React.memo(function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5">
      <div className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-4">{title}</div>
      {children}
    </div>
  );
});

export const DetailRow = React.memo(function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-sm py-1">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-semibold font-mono text-sm text-[var(--text-primary)]">{value}</span>
    </div>
  );
});

export const TechRow = React.memo(function TechRow({ label, value, signal }: { label: string; value: string; signal?: string }) {
  return (
    <div className="flex justify-between items-center text-sm py-1.5 border-b border-[var(--border)] last:border-b-0">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-semibold font-mono text-sm text-[var(--text-primary)]">
        {value}
        {signal && (
          <span className={`ml-2 inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${
            signal === 'bullish' ? 'bg-emerald-500/10 text-emerald-400' :
            signal === 'bearish' ? 'bg-red-500/10 text-red-400' :
            'bg-[var(--accent-soft)] text-[var(--text-muted)]'
          }`}>{signal}</span>
        )}
      </span>
    </div>
  );
});

/**
 * Semi-circular gauge built from SVG arc segments.
 *
 * ``value`` is clamped to [0, 1]. The needle maps linearly: 0 → left-most
 * (strong sell) and 1 → right-most (strong buy).
 */
export const GaugeSVG = React.memo(function GaugeSVG({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  const cx = 90;
  const cy = 85;
  const r = 70;
  const colors = ['#ff4444', '#ff8c42', '#888899', '#66cc66', '#00b368'];
  const gap = 0.02;
  const segArc = (Math.PI - gap * 4) / 5;

  const arcs = colors.map((color, i) => {
    const a1 = Math.PI - i * (segArc + gap);
    const a2 = a1 - segArc;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy - r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy - r * Math.sin(a2);
    return (
      <path
        key={i}
        d={`M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        opacity="0.7"
      />
    );
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
});

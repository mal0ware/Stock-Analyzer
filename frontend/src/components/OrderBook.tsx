import { useEffect, useState } from 'react';
import * as api from '../lib/api';

interface Props {
  symbol: string;
  levels?: number;
  compact?: boolean;
}

export default function OrderBook({ symbol, levels = 10, compact = false }: Props) {
  const [book, setBook] = useState<api.OrderBookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const fetchBook = async () => {
      try {
        const data = await api.orderbook(symbol, levels);
        if (!cancelled) { setBook(data); setError(''); }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load order book');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchBook();
    timer = window.setInterval(fetchBook, 5000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [symbol, levels]);

  if (loading && !book) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 space-y-2">
        <div className="skeleton h-4 w-32 rounded" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-5 w-full rounded" />
        ))}
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 text-xs text-[var(--text-muted)]">
        {error || 'No order book data'}
      </div>
    );
  }

  const maxSize = Math.max(
    ...book.bid_levels.map((l) => l.cumulative),
    ...book.ask_levels.map((l) => l.cumulative),
    1,
  );

  // Asks shown top-down (highest price at top), bids below
  const asksDisplay = [...book.ask_levels].slice(0, levels).reverse();
  const bidsDisplay = book.bid_levels.slice(0, levels);

  const imbalanceColor = book.imbalance > 0.15 ? 'text-emerald-400'
    : book.imbalance < -0.15 ? 'text-red-400'
    : 'text-[var(--text-muted)]';

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">Order Book</span>
          {book.synthetic && (
            <span
              title={book.source_note}
              className="text-[9px] font-semibold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md cursor-help"
            >
              Sim Depth
            </span>
          )}
        </div>
        <span className={`text-[10px] font-mono ${imbalanceColor}`}>
          imb {book.imbalance >= 0 ? '+' : ''}{(book.imbalance * 100).toFixed(0)}%
        </span>
      </div>

      {/* Column headers */}
      <div className={`grid grid-cols-3 gap-2 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)] ${compact ? '' : 'border-b border-[var(--border)]'}`}>
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Cumul.</span>
      </div>

      {/* Asks (top-down, highest at top) */}
      <div className="divide-y divide-[var(--border)]/30">
        {asksDisplay.map((lvl, i) => (
          <BookRow key={`a-${i}`} level={lvl} side="ask" maxSize={maxSize} />
        ))}
      </div>

      {/* Mid / Spread strip */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-primary)] border-y border-[var(--border)]">
        <span className="text-sm font-bold font-mono text-[var(--text-primary)]">
          ${book.mid.toFixed(2)}
        </span>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">
          spr ${book.spread.toFixed(2)} · {book.spread_bps.toFixed(1)}bps
        </span>
      </div>

      {/* Bids */}
      <div className="divide-y divide-[var(--border)]/30">
        {bidsDisplay.map((lvl, i) => (
          <BookRow key={`b-${i}`} level={lvl} side="bid" maxSize={maxSize} />
        ))}
      </div>
    </div>
  );
}

function BookRow({ level, side, maxSize }: { level: api.OrderBookLevel; side: 'bid' | 'ask'; maxSize: number }) {
  const fillPct = (level.cumulative / maxSize) * 100;
  const fillColor = side === 'bid' ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)';
  const priceColor = side === 'bid' ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="relative grid grid-cols-3 gap-2 px-3 py-1 text-[11px] font-mono">
      {/* Cumulative depth bar */}
      <div
        className="absolute inset-y-0 right-0 pointer-events-none"
        style={{ width: `${fillPct}%`, background: fillColor }}
      />
      <span className={`relative ${priceColor} font-semibold`}>${level.price.toFixed(2)}</span>
      <span className="relative text-right text-[var(--text-secondary)]">{level.size.toLocaleString()}</span>
      <span className="relative text-right text-[var(--text-muted)]">{level.cumulative.toLocaleString()}</span>
    </div>
  );
}

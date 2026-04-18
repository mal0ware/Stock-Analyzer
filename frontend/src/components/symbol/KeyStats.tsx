/**
 * Two-column grid of fundamentals. Renders nothing if every field is null.
 */

import React from 'react';
import * as api from '../../lib/api';
import { SectionTitle, fmt, fmtLarge } from './shared';

function KeyStatsImpl({ quote: q }: { quote: api.QuoteData }) {
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

  if (stats.every(([, v]) => v === '--')) return null;

  return (
    <section>
      <SectionTitle>Key Statistics</SectionTitle>
      <div className="grid grid-cols-2 divide-y divide-[var(--border)]">
        {stats.map(([label, value], i) => (
          <div
            key={label}
            className={`flex justify-between items-center py-2 text-sm ${i % 2 === 1 ? 'pl-5 border-l border-[var(--border)]' : 'pr-5'}`}
          >
            <span className="text-[var(--text-secondary)]">{label}</span>
            <span className="font-semibold font-mono text-sm text-[var(--text-primary)]">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default React.memo(KeyStatsImpl);

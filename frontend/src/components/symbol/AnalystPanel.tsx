/**
 * Analyst consensus panel.
 *
 * Renders a gauge driven by the yfinance ``recommendationMean`` (1 = strong
 * buy, 5 = strong sell), along with price targets and auto-generated
 * rationale strings sourced from fundamentals (revenue growth, margins,
 * forward P/E).
 */

import React from 'react';
import * as api from '../../lib/api';
import { DetailRow, GaugeSVG, Panel, fmt, gaugeColor, ratingLabel } from './shared';

function analystReasons(q: api.QuoteData): string[] {
  const reasons: string[] = [];
  const qAny = q as any;
  const price = q.price;
  const target = qAny.targetMeanPrice;

  if (target != null && price != null && price > 0) {
    const upside = ((target - price) / price) * 100;
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
    if (qAny.forwardPE < qAny.peRatio * 0.85) {
      reasons.push(`Forward P/E of ${fmt(qAny.forwardPE)} below trailing ${fmt(qAny.peRatio)}, implying expected earnings improvement`);
    }
  }

  if (qAny.profitMargins != null) {
    const pm = qAny.profitMargins * 100;
    if (pm > 20) reasons.push(`High profit margins of ${fmt(pm)}% indicate pricing power`);
    else if (pm < 0) reasons.push(`Currently unprofitable with ${fmt(pm)}% margins`);
  }

  return reasons.slice(0, 5);
}

function AnalystPanelImpl({ quote: q }: { quote: api.QuoteData }) {
  const qAny = q as any;
  const rec = qAny.recommendationKey || '';
  const mean = qAny.recommendationMean;
  const count = qAny.numberOfAnalystOpinions || 0;
  const targetMean = qAny.targetMeanPrice;
  const targetHigh = qAny.targetHighPrice;
  const targetLow = qAny.targetLowPrice;

  if (!rec && !mean && count === 0) {
    return (
      <Panel title="Analyst Rating">
        <p className="text-sm text-[var(--text-muted)]">No analyst data available</p>
      </Panel>
    );
  }

  // yfinance mean: 1 = strong buy → 5 = strong sell. Invert to 0–1 scale
  // so the gauge reads left-to-right as sell-to-buy.
  let gaugeValue = 0.5;
  if (mean != null && mean > 0) gaugeValue = 1 - (mean - 1) / 4;
  gaugeValue = Math.max(0, Math.min(1, gaugeValue));

  const label = ratingLabel(rec, gaugeValue);
  const color = gaugeColor(gaugeValue);
  const upside = targetMean != null && q.price != null && q.price > 0
    ? ((targetMean - q.price) / q.price) * 100
    : null;
  const reasons = analystReasons(q);

  return (
    <Panel title="Analyst Rating">
      <GaugeSVG value={gaugeValue} />
      <div className="text-center text-base font-extrabold" style={{ color }}>{label}</div>
      <div className="text-center text-xs text-[var(--text-muted)] mt-0.5">{count} analyst{count !== 1 ? 's' : ''}</div>
      {targetMean != null && upside != null && (
        <div className="mt-3 space-y-1.5">
          <DetailRow label="Price Target" value={`$${fmt(targetMean)}`} />
          <DetailRow
            label="Upside"
            value={
              <span className={upside >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {upside >= 0 ? '+' : ''}{fmt(upside)}%
              </span>
            }
          />
          {targetHigh != null && <DetailRow label="High Target" value={`$${fmt(targetHigh)}`} />}
          {targetLow != null && <DetailRow label="Low Target" value={`$${fmt(targetLow)}`} />}
        </div>
      )}
      {reasons.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Why analysts say {label.toLowerCase()}
          </div>
          {reasons.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)] leading-relaxed mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] flex-shrink-0 mt-1.5" />
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default React.memo(AnalystPanelImpl);

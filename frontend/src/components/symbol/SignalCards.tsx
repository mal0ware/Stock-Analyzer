/**
 * Top-of-page 4-card row: Trend / Anomaly / Sentiment / Volume.
 *
 * Derives the display colour from the snapshot payload so the parent
 * page doesn't have to reason about threshold logic.
 */

import React from 'react';
import * as api from '../../lib/api';
import { formatLargeNumber } from '../../lib/format';

function SignalCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-[var(--bg-card)] rounded-2xl p-3.5 border border-[var(--border)]">
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium">{label}</div>
      <div className={`text-lg font-semibold mt-1 capitalize ${color}`}>{value}</div>
      <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{sub}</div>
    </div>
  );
}

function trendColor(trend: string): string {
  if (trend.includes('uptrend')) return 'text-emerald-400';
  if (trend.includes('downtrend')) return 'text-red-400';
  return 'text-yellow-400';
}

function sentimentColor(composite: number | null | undefined): string {
  if (composite == null) return 'text-[var(--text-muted)]';
  if (composite > 0.15) return 'text-emerald-400';
  if (composite < -0.15) return 'text-red-400';
  return 'text-yellow-400';
}

function SignalCardsImpl({ snap }: { snap: api.SnapshotData }) {
  const { signals, sentiment, price } = snap;
  const sentimentValue = sentiment.label ?? (sentiment.composite != null ? sentiment.composite.toFixed(2) : '\u2014');
  const sentimentSub = sentiment.method ? `via ${sentiment.method}` : `${sentiment.sample_size} sources`;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
      <SignalCard
        label="Trend"
        value={signals.trend.replace('_', ' ')}
        sub={`${(signals.trend_confidence * 100).toFixed(0)}% confidence`}
        color={trendColor(signals.trend)}
      />
      <SignalCard
        label="Anomaly Score"
        value={signals.anomaly_score.toFixed(2)}
        sub={signals.anomaly_flag ? 'ANOMALY DETECTED' : 'Normal'}
        color={signals.anomaly_flag ? 'text-orange-400' : 'text-[var(--text-secondary)]'}
      />
      <SignalCard
        label="Sentiment"
        value={sentimentValue}
        sub={sentimentSub}
        color={sentimentColor(sentiment.composite)}
      />
      <SignalCard
        label="Volume"
        value={formatLargeNumber(price.volume)}
        sub="Today"
        color="text-[var(--text-secondary)]"
      />
    </div>
  );
}

export default React.memo(SignalCardsImpl);

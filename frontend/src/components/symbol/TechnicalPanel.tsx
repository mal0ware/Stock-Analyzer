/**
 * Technical analysis panel.
 *
 * Aggregates 3–4 indicator signals (RSI, trend, MACD histogram, period
 * return) into a single gauge value and renders a key indicator table.
 * Each signal contributes a score in [0, 1] via hand-tuned thresholds.
 */

import React from 'react';
import * as api from '../../lib/api';
import { GaugeSVG, Panel, TechRow, fmt, gaugeColor } from './shared';

type Signal = 'bullish' | 'bearish' | 'neutral';

function rsiScore(rsi: number): number {
  if (rsi < 30) return 0.8;
  if (rsi < 45) return 0.65;
  if (rsi < 55) return 0.5;
  if (rsi < 70) return 0.35;
  return 0.15;
}

function trendScore(trend: string): number {
  if (trend === 'uptrend') return 0.85;
  if (trend === 'downtrend') return 0.15;
  return 0.5;
}

function returnScore(r: number): number {
  if (r > 10) return 0.8;
  if (r > 0) return 0.6;
  if (r > -10) return 0.4;
  return 0.2;
}

function signalOf(value: number, bullThreshold = 0, bearThreshold = 0): Signal {
  if (value > bullThreshold) return 'bullish';
  if (value < bearThreshold) return 'bearish';
  return 'neutral';
}

function TechnicalPanelImpl({ data }: { data: api.AnalysisData | null }) {
  if (!data) {
    return (
      <Panel title="Technical Analysis">
        <p className="text-sm text-[var(--text-muted)]">Loading technical data...</p>
      </Panel>
    );
  }

  const signals: number[] = [];
  const rsi = data.currentRsi;
  if (rsi != null) signals.push(rsiScore(rsi));
  signals.push(trendScore(data.trend));

  const macdHist = data.macd?.histogram;
  const lastMacd = macdHist && macdHist.length > 0 ? macdHist[macdHist.length - 1] : null;
  if (lastMacd != null) signals.push(lastMacd > 0 ? 0.75 : lastMacd < 0 ? 0.25 : 0.5);

  if (data.periodReturn != null) signals.push(returnScore(data.periodReturn));

  const gaugeValue = signals.length > 0
    ? signals.reduce((a, b) => a + b, 0) / signals.length
    : 0.5;

  const label =
    gaugeValue >= 0.75 ? 'Strong Buy' :
    gaugeValue >= 0.6  ? 'Buy' :
    gaugeValue >= 0.4  ? 'Neutral' :
    gaugeValue >= 0.25 ? 'Sell' :
                         'Strong Sell';
  const color = gaugeColor(gaugeValue);

  const trendLabel = data.trend
    ? data.trend.charAt(0).toUpperCase() + data.trend.slice(1)
    : '--';

  return (
    <Panel title="Technical Analysis">
      <GaugeSVG value={gaugeValue} />
      <div className="text-center text-base font-extrabold" style={{ color }}>{label}</div>
      <div className="text-center text-xs text-[var(--text-muted)] mt-0.5">Based on {signals.length} indicators</div>
      <div className="mt-3 space-y-0">
        <TechRow
          label="Trend"
          value={trendLabel}
          signal={data.trend === 'uptrend' ? 'bullish' : data.trend === 'downtrend' ? 'bearish' : 'neutral'}
        />
        {rsi != null && (
          <TechRow
            label="RSI (14)"
            value={fmt(rsi)}
            signal={rsi < 30 ? 'bullish' : rsi > 70 ? 'bearish' : 'neutral'}
          />
        )}
        {lastMacd != null && (
          <TechRow label="MACD" value={fmt(lastMacd)} signal={signalOf(lastMacd)} />
        )}
        <TechRow label="Volatility" value={data.volatility != null ? `${fmt(data.volatility)}%` : '--'} />
        <TechRow
          label="Period Return"
          value={data.periodReturn != null ? `${data.periodReturn >= 0 ? '+' : ''}${fmt(data.periodReturn)}%` : '--'}
          signal={data.periodReturn != null ? signalOf(data.periodReturn) : undefined}
        />
        {data.supportResistance && (
          <>
            <TechRow label="Support" value={`$${fmt(data.supportResistance.support)}`} />
            <TechRow label="Resistance" value={`$${fmt(data.supportResistance.resistance)}`} />
          </>
        )}
        {data.sma20 && data.sma20.length > 0 && (
          <TechRow label="SMA 20" value={`$${fmt(data.sma20[data.sma20.length - 1])}`} />
        )}
        {data.sma50 && data.sma50.length > 0 && (
          <TechRow label="SMA 50" value={`$${fmt(data.sma50[data.sma50.length - 1])}`} />
        )}
      </div>
    </Panel>
  );
}

export default React.memo(TechnicalPanelImpl);

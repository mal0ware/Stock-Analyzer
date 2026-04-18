/**
 * Narrative overview panel.
 *
 * Synthesises fundamentals, valuation, and technicals into 3–4 plain
 * English paragraphs followed by a single actionable strategy blurb.
 * All text is generated client-side from fields already fetched by the
 * parent — no extra round-trip.
 */

import React from 'react';
import * as api from '../../lib/api';
import { SectionTitle, fmt } from './shared';

function sizeLabel(mcap: number | null | undefined): string {
  if (mcap == null) return 'company';
  if (mcap >= 200e9) return 'mega-cap company';
  if (mcap >= 10e9) return 'large-cap company';
  if (mcap >= 2e9) return 'mid-cap company';
  if (mcap >= 300e6) return 'small-cap company';
  return 'micro-cap company';
}

function buildParagraphs(q: api.QuoteData, a: api.AnalysisData | null): string[] {
  const qAny = q as any;
  const out: string[] = [];

  out.push(
    `${q.name || q.symbol} (${q.symbol}) is a ${sizeLabel(q.marketCap)} in the ${q.sector || 'N/A'}${q.industry ? ' / ' + q.industry : ''} sector, currently trading at $${fmt(q.price)}.`,
  );

  const high52 = qAny.fiftyTwoWeekHigh;
  const low52 = qAny.fiftyTwoWeekLow;
  if (high52 != null && low52 != null && q.price != null) {
    const range = high52 - low52;
    const position = range > 0 ? ((q.price - low52) / range) * 100 : 50;
    if (position > 85) {
      out.push(`The stock is trading near its 52-week high of $${fmt(high52)}, indicating strong recent momentum but limited upside before hitting resistance.`);
    } else if (position < 15) {
      out.push(`The stock is near its 52-week low of $${fmt(low52)}, which could represent a value opportunity or a warning of continued deterioration.`);
    } else {
      out.push(`Trading at the ${Math.round(position)}th percentile of its 52-week range ($${fmt(low52)} \u2013 $${fmt(high52)}).`);
    }
  }

  if (qAny.peRatio != null && qAny.peRatio > 0) {
    if (qAny.peRatio > 40) out.push(`At a P/E ratio of ${fmt(qAny.peRatio)}, the stock is priced for significant growth. Value investors may see it as overextended.`);
    else if (qAny.peRatio > 20) out.push(`The P/E ratio of ${fmt(qAny.peRatio)} suggests moderate valuation relative to earnings.`);
    else out.push(`With a P/E of ${fmt(qAny.peRatio)}, the stock appears reasonably valued.`);
  }

  if (a?.trend) {
    let tech = `Technically, the stock is in a${a.trend === 'uptrend' ? 'n uptrend' : a.trend === 'downtrend' ? ' downtrend' : ' sideways range'}`;
    if (a.currentRsi != null) {
      const rsiNote =
        a.currentRsi > 70 ? 'overbought' :
        a.currentRsi < 30 ? 'oversold' :
                            'neutral';
      tech += ` with RSI at ${fmt(a.currentRsi)} (${rsiNote})`;
    }
    out.push(tech + '.');
  }

  return out;
}

function buildStrategy(q: api.QuoteData, a: api.AnalysisData | null): string {
  const qAny = q as any;
  const target = qAny.targetMeanPrice;
  const price = q.price;
  const rec = qAny.recommendationKey || '';

  if (target != null && price != null && price > 0) {
    const upside = ((target - price) / price) * 100;
    const support = a?.supportResistance?.support;
    const resistance = a?.supportResistance?.resistance;

    if (upside > 30 && (rec === 'buy' || rec === 'strong_buy')) {
      let s = `Analysts see ${fmt(upside)}% upside to $${fmt(target)}. `;
      if (support) s += `Consider entries near support at $${fmt(support)}. `;
      return s + 'This is a longer-term conviction play \u2014 consider a 6\u201312 month hold.';
    }
    if (upside > 10) {
      let s = `Consensus target of $${fmt(target)} implies ${fmt(upside)}% upside. `;
      if (support && resistance) s += `Support near $${fmt(support)}, resistance near $${fmt(resistance)}. `;
      return s + 'A moderate position with a 3\u20136 month horizon could be appropriate.';
    }
    if (upside > -5) {
      return `Trading close to the analyst target of $${fmt(target)}. Most of the move may be priced in. Watch for catalysts before committing new capital.`;
    }
    return `Currently above consensus target of $${fmt(target)} by ${fmt(Math.abs(upside))}%. Consider trimming positions or setting stop-losses near support.`;
  }

  if (a?.trend === 'uptrend') return 'The stock is in an uptrend. Look for pullbacks to moving averages as entry points.';
  if (a?.trend === 'downtrend') return 'The stock is in a downtrend. Wait for signs of reversal before entering.';
  return '';
}

function AIOverviewImpl({ quote: q, analysis: a }: { quote: api.QuoteData; analysis: api.AnalysisData | null }) {
  const paragraphs = buildParagraphs(q, a);
  const strategy = buildStrategy(q, a);

  if (paragraphs.length === 0) return null;

  return (
    <section>
      <SectionTitle>Overview</SectionTitle>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5">
        <div className="text-sm text-[var(--text-secondary)] leading-[1.7] space-y-3">
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        {strategy && (
          <div className="flex items-start gap-3 mt-4 p-3.5 bg-[var(--accent-soft)] border border-[var(--accent)]/20 rounded-lg text-sm text-[var(--text-primary)] leading-relaxed">
            <span className="text-lg flex-shrink-0">*</span>
            <div>{strategy}</div>
          </div>
        )}
      </div>
    </section>
  );
}

export default React.memo(AIOverviewImpl);

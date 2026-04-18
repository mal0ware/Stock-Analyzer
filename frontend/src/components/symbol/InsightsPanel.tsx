/**
 * Bulleted analysis insights (derived server-side via ``api.interpret``).
 */

import React from 'react';
import { SectionTitle } from './shared';

function InsightsPanelImpl({ insights }: { insights: string[] }) {
  if (insights.length === 0) return null;
  return (
    <section>
      <SectionTitle>Analysis Insights</SectionTitle>
      <div className="space-y-2">
        {insights.map((item, i) => (
          <div
            key={i}
            className="text-sm text-[var(--text-secondary)] leading-relaxed py-2.5 px-3.5 bg-[var(--bg-card)] rounded-lg border-l-[3px] border-[var(--accent)]"
          >
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

export default React.memo(InsightsPanelImpl);

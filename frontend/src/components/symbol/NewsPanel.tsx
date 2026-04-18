/**
 * Recent-news list with thumbnails. Only renders when articles are present.
 */

import React from 'react';
import * as api from '../../lib/api';
import { SectionTitle, fmtDate } from './shared';

function NewsPanelImpl({ articles }: { articles: api.NewsArticle[] }) {
  if (articles.length === 0) return null;

  return (
    <section>
      <SectionTitle>Recent News</SectionTitle>
      <div className="divide-y divide-[var(--border)]">
        {articles.map((a, i) => (
          <a
            key={i}
            href={a.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3.5 py-3 hover:bg-[var(--bg-card)] transition-colors rounded-lg px-2 -mx-2"
          >
            {a.thumbnail && /^https:\/\//.test(a.thumbnail) && (
              <img
                src={a.thumbnail}
                alt=""
                className="w-[72px] h-12 rounded object-cover bg-[var(--bg-card)] flex-shrink-0"
                loading="lazy"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[var(--text-primary)] line-clamp-2">{a.title}</div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">
                {a.publisher}{a.publishedAt ? ` \u2022 ${fmtDate(a.publishedAt)}` : ''}
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

export default React.memo(NewsPanelImpl);

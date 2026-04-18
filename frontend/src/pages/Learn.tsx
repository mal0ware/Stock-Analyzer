import { useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api';

export default function Learn() {
  const [terms, setTerms] = useState<api.GlossaryTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');

  useEffect(() => {
    api.glossary()
      .then((d) => setTerms(d.terms))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const set = new Set(terms.map((t) => t.category));
    return ['all', ...Array.from(set).sort()];
  }, [terms]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return terms.filter((t) => {
      if (category !== 'all' && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.definition.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [terms, query, category]);

  if (loading) return <LearnSkeleton />;
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <div className="text-red-400 font-medium">Failed to load glossary</div>
        <div className="text-[var(--text-muted)] text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Stock Market Glossary</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Everything you need to know about stock statistics, explained in plain English.
        </p>
      </div>

      <div className="max-w-md mx-auto">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search terms..."
          className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-all"
        />
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              category === c
                ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border)]'
            }`}
          >
            {c === 'all' ? 'All' : c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-[var(--text-muted)] py-10">No matching terms found.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map((t) => (
            <div
              key={t.name}
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--accent)]/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="font-semibold text-[var(--text-primary)] text-sm">{t.name}</h3>
                <span className="shrink-0 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)]">
                  {t.category}
                </span>
              </div>
              <Section title="What is it?" text={t.definition} />
              <Section title="Why does it matter?" text={t.whyItMatters} />
              <Section title="Typical ranges" text={t.ranges} mono />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, text, mono = false }: { title: string; text: string; mono?: boolean }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium mb-1">
        {title}
      </div>
      <div
        className={`text-xs leading-relaxed text-[var(--text-secondary)] ${mono ? 'font-mono' : ''}`}
      >
        {text}
      </div>
    </div>
  );
}

function LearnSkeleton() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="skeleton h-8 w-64 mx-auto" />
        <div className="skeleton h-4 w-96 mx-auto mt-2" />
      </div>
      <div className="skeleton h-10 max-w-md mx-auto rounded-lg" />
      <div className="grid sm:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

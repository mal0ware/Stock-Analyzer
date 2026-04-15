import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import * as api from '../lib/api';
import { useTheme, THEMES, type Theme } from '../hooks/useTheme';

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/anomalies', label: 'Anomalies' },
  { to: '/learn', label: 'Learn' },
];

export default function Layout() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<api.SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const themeWrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (searchWrapRef.current && !searchWrapRef.current.contains(t)) {
        setShowResults(false);
      }
      if (themeWrapRef.current && !themeWrapRef.current.contains(t)) {
        setThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleSearch = (value: string) => {
    setQuery(value);
    setActiveIdx(0);
    clearTimeout(timerRef.current);
    if (value.length < 1) {
      setResults([]);
      setShowResults(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const data = await api.search(value);
        setResults(data.results);
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults || results.length === 0) {
      if (e.key === 'Enter' && query && !loading) {
        selectResult(query.toUpperCase().trim());
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectResult(results[activeIdx].symbol);
    } else if (e.key === 'Escape') {
      setShowResults(false);
      inputRef.current?.blur();
    }
  };

  const selectResult = (symbol: string) => {
    setQuery('');
    setShowResults(false);
    setResults([]);
    navigate(`/symbol/${symbol}`);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="bg-[var(--bg-header)]/90 backdrop-blur-md border-b border-[var(--border)] shrink-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
          <NavLink to="/" className="text-lg font-semibold text-[var(--text-primary)] whitespace-nowrap tracking-tight">
            Stock Analyzer
          </NavLink>

          <nav className="hidden sm:flex gap-1">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="relative ml-auto" ref={searchWrapRef}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => results.length > 0 && setShowResults(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search symbol…  (press /)"
              className="w-56 sm:w-64 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg pl-3 pr-8 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-all"
            />
            {loading && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-[var(--text-muted)] border-t-transparent animate-spin" />
            )}
            {showResults && results.length > 0 && (
              <div className="absolute top-full mt-1.5 right-0 w-80 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-2xl shadow-black/40 max-h-72 overflow-y-auto z-50">
                {results.map((r, i) => (
                  <button
                    key={r.symbol}
                    onClick={() => selectResult(r.symbol)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`w-full text-left px-3 py-2.5 flex justify-between items-center transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      i === activeIdx ? 'bg-[var(--bg-card-hover)]' : ''
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-[var(--text-primary)] text-sm">{r.symbol}</span>
                      {r.exchange && (
                        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{r.exchange}</span>
                      )}
                    </div>
                    <span className="text-xs text-[var(--text-secondary)] truncate ml-3 max-w-[180px] text-right">
                      {r.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {showResults && !loading && query && results.length === 0 && (
              <div className="absolute top-full mt-1.5 right-0 w-80 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-2xl shadow-black/40 z-50 px-3 py-3 text-xs text-[var(--text-muted)]">
                No matches. Press Enter to open "{query.toUpperCase()}" directly.
              </div>
            )}
          </div>

          <div className="relative" ref={themeWrapRef}>
            <button
              onClick={() => setThemeOpen((v) => !v)}
              title="Change theme"
              className="px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] text-base leading-none"
            >
              🎨
            </button>
            {themeOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-44 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-2xl shadow-black/40 py-1 z-50">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTheme(t.id as Theme);
                      setThemeOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--bg-card-hover)] transition-colors ${
                      theme === t.id ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded border border-[var(--border)] shrink-0"
                      style={{ background: t.swatch }}
                    />
                    <span className="flex-1">{t.label}</span>
                    {theme === t.id && <span className="text-[var(--accent)]">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
          <Outlet />
        </div>
      </main>

      <footer className="border-t border-[var(--border)] py-3 text-center text-xs text-[var(--text-muted)] shrink-0">
        Data analysis tool — not financial advice. Past performance does not indicate future results.
      </footer>
    </div>
  );
}

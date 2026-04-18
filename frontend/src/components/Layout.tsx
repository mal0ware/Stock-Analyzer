import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import * as api from '../lib/api';
import { useTheme, THEMES, type Theme } from '../hooks/useTheme';
import { useMagnetic } from '../hooks/useMagnetic';
import { useTabStore } from '../stores/tabStore';
import TabBar from './TabBar';

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/anomalies', label: 'Anomalies' },
  { to: '/simulator', label: 'Simulator' },
  { to: '/learn', label: 'Learn' },
];

function MagneticNavLink({ to, label, isEnd }: { to: string; label: string; isEnd?: boolean }) {
  const ref = useMagnetic<HTMLSpanElement>({ x: 0.2, y: 0.3 });
  return (
    <NavLink
      to={to}
      end={isEnd}
      className={({ isActive }) =>
        `px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all ${
          isActive
            ? 'bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
        }`
      }
    >
      <span ref={ref} className="inline-block">{label}</span>
    </NavLink>
  );
}

export default function Layout() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<api.SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const themeWrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const { theme, setTheme, previewTheme, cancelPreview } = useTheme();
  const openTab = useTabStore((s) => s.openTab);

  // Loading screen
  useEffect(() => {
    const timer = setTimeout(() => setAppReady(true), 900);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (searchWrapRef.current && !searchWrapRef.current.contains(t)) {
        setShowResults(false);
      }
      if (themeWrapRef.current && !themeWrapRef.current.contains(t)) {
        setThemeOpen(false);
        cancelPreview();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [cancelPreview]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K for search
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
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
    openTab(symbol);
    navigate(`/symbol/${symbol}`);
  };

  return (
    <>
      {/* Loading screen */}
      <div id="app-loader" className={appReady ? 'done' : ''}>
        <svg viewBox="0 0 512 512" className="w-16 h-16">
          <defs>
            <linearGradient id="loader-bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0f172a"/>
              <stop offset="100%" stopColor="#1e1b4b"/>
            </linearGradient>
            <linearGradient id="loader-line" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6"/>
              <stop offset="50%" stopColor="#6366f1"/>
              <stop offset="100%" stopColor="#8b5cf6"/>
            </linearGradient>
          </defs>
          <rect x="16" y="16" width="480" height="480" rx="96" fill="url(#loader-bg)"/>
          <polyline points="100,340 160,310 220,320 260,280 300,250 340,210 380,180 420,150"
            fill="none" stroke="url(#loader-line)" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div className="loader-bar-track">
          <div className="loader-bar-fill" />
        </div>
      </div>

      <div className="flex flex-col h-full">
        <header className="bg-[var(--bg-header)]/90 backdrop-blur-xl border-b border-[var(--border)] shrink-0 z-50">
          <div className="w-full px-5 sm:px-8 h-14 flex items-center gap-6">
            <NavLink to="/" className="flex items-center gap-2.5 text-[var(--text-primary)] whitespace-nowrap tracking-tight">
              <svg viewBox="0 0 512 512" className="w-7 h-7 shrink-0">
                <defs>
                  <linearGradient id="nav-bg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#0f172a"/>
                    <stop offset="100%" stopColor="#1e1b4b"/>
                  </linearGradient>
                  <linearGradient id="nav-line" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6"/>
                    <stop offset="50%" stopColor="#6366f1"/>
                    <stop offset="100%" stopColor="#8b5cf6"/>
                  </linearGradient>
                </defs>
                <rect x="16" y="16" width="480" height="480" rx="96" fill="url(#nav-bg)"/>
                <polyline points="100,340 160,310 220,320 260,280 300,250 340,210 380,180 420,150"
                  fill="none" stroke="url(#nav-line)" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-lg font-semibold">Stock Analyzer</span>
            </NavLink>

            <nav className="hidden sm:flex gap-1">
              {navItems.map(({ to, label }) => (
                <MagneticNavLink key={to} to={to} label={label} isEnd={to === '/'} />
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
                placeholder="Search symbol...  /"
                className="w-48 sm:w-64 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl pl-3 pr-8 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-all"
              />
              {loading && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-[var(--text-muted)] border-t-transparent animate-spin" />
              )}
              {showResults && results.length > 0 && (
                <div className="absolute top-full mt-2 right-0 w-80 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-2xl shadow-black/40 max-h-72 overflow-y-auto z-50 p-1">
                  {results.map((r, i) => (
                    <button
                      key={r.symbol}
                      onClick={() => selectResult(r.symbol)}
                      onMouseEnter={() => setActiveIdx(i)}
                      className={`w-full text-left px-3 py-2.5 flex justify-between items-center transition-colors rounded-xl ${
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
                <div className="absolute top-full mt-2 right-0 w-80 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-2xl shadow-black/40 z-50 px-4 py-3 text-xs text-[var(--text-muted)]">
                  No matches. Press Enter to open "{query.toUpperCase()}" directly.
                </div>
              )}
            </div>

            <div className="relative" ref={themeWrapRef}>
              <button
                onClick={() => setThemeOpen((v) => !v)}
                title="Change theme"
                className="w-8 h-8 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] flex items-center justify-center transition-colors"
              >
                <span className="w-4 h-4 rounded-full" style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)' }} />
              </button>
              {themeOpen && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-2xl shadow-black/40 p-1 z-50">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTheme(t.id as Theme);
                        setThemeOpen(false);
                      }}
                      onMouseEnter={() => previewTheme(t.id)}
                      onMouseLeave={() => cancelPreview()}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm rounded-xl hover:bg-[var(--bg-card-hover)] transition-colors ${
                        theme === t.id ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'
                      }`}
                    >
                      <span
                        className="w-5 h-5 rounded-lg border border-[var(--border)] shrink-0"
                        style={{ background: t.swatch }}
                      />
                      <span className="flex-1">{t.label}</span>
                      {theme === t.id && <span className="text-[var(--accent)] text-xs">Active</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        <TabBar />

        <main className="flex-1 overflow-y-auto min-h-0">
          <div className="w-full px-5 sm:px-8 py-6">
            <Outlet />
          </div>
        </main>

        <footer className="border-t border-[var(--border)] py-3 shrink-0">
          <div className="w-full px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
            <span>Data analysis tool -- not financial advice. Past performance does not indicate future results.</span>
            <span className="flex items-center gap-3">
              <span>Built by{' '}
                <a href="https://mal0ware.github.io/portfolio/" target="_blank" rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline">mal0ware</a>
              </span>
              <span className="text-[var(--border)]">|</span>
              <a href="mailto:mal0ss.network@gmail.com" className="text-[var(--accent)] hover:underline">Contact</a>
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}

import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import * as api from '../lib/api';

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/anomalies', label: 'Anomalies' },
];

export default function Layout() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<api.SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = (value: string) => {
    setQuery(value);
    clearTimeout(timerRef.current);
    if (value.length < 1) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const data = await api.search(value);
        setResults(data.results);
        setShowResults(true);
      } catch { setResults([]); }
    }, 300);
  };

  const selectResult = (symbol: string) => {
    setQuery('');
    setShowResults(false);
    setResults([]);
    navigate(`/symbol/${symbol}`);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-gray-900/80 backdrop-blur border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
          <NavLink to="/" className="text-lg font-semibold text-white whitespace-nowrap">
            AI Market Analyst
          </NavLink>

          <nav className="flex gap-1">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded text-sm transition-colors ${
                    isActive ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-gray-200'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="relative ml-auto" ref={wrapperRef}>
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => results.length > 0 && setShowResults(true)}
              placeholder="Search symbol..."
              className="w-56 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            {showResults && results.length > 0 && (
              <div className="absolute top-full mt-1 w-72 bg-gray-800 border border-gray-700 rounded shadow-xl max-h-64 overflow-y-auto">
                {results.map((r) => (
                  <button
                    key={r.symbol}
                    onClick={() => selectResult(r.symbol)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-700 flex justify-between items-center"
                  >
                    <span className="font-medium text-white text-sm">{r.symbol}</span>
                    <span className="text-xs text-gray-400 truncate ml-2">{r.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-gray-800 py-3 text-center text-xs text-gray-500">
        This tool provides data analysis and is not financial advice. Past performance does not indicate future results.
      </footer>
    </div>
  );
}

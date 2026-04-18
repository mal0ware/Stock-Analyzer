import { useNavigate, useLocation } from 'react-router-dom';
import { useTabStore } from '../stores/tabStore';

export default function TabBar() {
  const { tabs, activeTab, setActiveTab, closeTab } = useTabStore();
  const navigate = useNavigate();
  const location = useLocation();

  if (tabs.length === 0) return null;

  const handleClick = (symbol: string) => {
    setActiveTab(symbol);
    navigate(`/symbol/${symbol}`);
  };

  const handleClose = (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation();
    const isActive = activeTab === symbol;
    closeTab(symbol);

    if (isActive) {
      const remaining = tabs.filter((t) => t.symbol !== symbol);
      if (remaining.length > 0) {
        const newActive = remaining[remaining.length - 1].symbol;
        navigate(`/symbol/${newActive}`);
      } else if (location.pathname.startsWith('/symbol/')) {
        navigate('/');
      }
    }
  };

  return (
    <div className="bg-[var(--bg-header)] border-b border-[var(--border)] shrink-0 overflow-x-auto">
      <div className="flex items-center px-5 sm:px-8 gap-0.5 min-w-0">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.symbol && location.pathname === `/symbol/${tab.symbol}`;
          return (
            <button
              key={tab.symbol}
              onClick={() => handleClick(tab.symbol)}
              className={`group flex items-center gap-2 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border)]'
              }`}
            >
              <span className="font-mono text-xs">{tab.symbol}</span>
              {tab.label !== tab.symbol && (
                <span className="text-[var(--text-muted)] text-xs max-w-[120px] truncate hidden sm:inline">
                  {tab.label}
                </span>
              )}
              <span
                onClick={(e) => handleClose(e, tab.symbol)}
                className="w-4 h-4 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useSimulatorStore } from '../stores/simulatorStore';

/**
 * Per-tick P&L readouts live here. Every subscription below is a single-
 * field selector so React only re-renders when the specific slice it
 * depends on changes — avoiding cascade re-renders during playback.
 */
const selectCurrentPrice = (s: ReturnType<typeof useSimulatorStore.getState>) =>
  s.currentIndex > 0 && s.allCandles[s.currentIndex - 1]
    ? s.allCandles[s.currentIndex - 1].close
    : 0;

export default function PositionSidebar() {
  const openPositions = useSimulatorStore((s) => s.openPositions);
  const closedPositions = useSimulatorStore((s) => s.closedPositions);
  const cashBalance = useSimulatorStore((s) => s.cashBalance);
  const initialBalance = useSimulatorStore((s) => s.initialBalance);
  const closePosition = useSimulatorStore((s) => s.closePosition);
  const currentPrice = useSimulatorStore(selectCurrentPrice);
  const [showClosed, setShowClosed] = useState(false);

  const unrealizedPnl = openPositions.reduce((sum, pos) => {
    const pnl = pos.side === 'long'
      ? (currentPrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - currentPrice) * pos.quantity;
    return sum + pnl;
  }, 0);

  const positionValue = openPositions.reduce(
    (sum, pos) => sum + currentPrice * pos.quantity,
    0,
  );

  const totalEquity = cashBalance + positionValue;
  const totalPnl = totalEquity - initialBalance;
  const totalPnlPct = (totalPnl / initialBalance) * 100;

  const wins = closedPositions.filter((p) => (p.pnl ?? 0) > 0);
  const losses = closedPositions.filter((p) => (p.pnl ?? 0) <= 0);
  const winRate = closedPositions.length > 0 ? (wins.length / closedPositions.length) * 100 : 0;
  const totalWins = wins.reduce((s, p) => s + (p.pnl ?? 0), 0);
  const totalLosses = Math.abs(losses.reduce((s, p) => s + (p.pnl ?? 0), 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-px bg-[var(--border)]">
        <StatCell label="Total Equity" value={`$${totalEquity.toFixed(2)}`} />
        <StatCell label="Cash" value={`$${cashBalance.toFixed(2)}`} />
        <StatCell label="Total P&L"
          value={`${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%`}
          sub={`${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`}
          color={totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        <StatCell label="Unrealized"
          value={unrealizedPnl === 0 ? '0.00%' : `${unrealizedPnl >= 0 ? '+' : ''}${(initialBalance > 0 ? (unrealizedPnl / initialBalance * 100) : 0).toFixed(2)}%`}
          sub={`${unrealizedPnl >= 0 ? '+' : ''}$${unrealizedPnl.toFixed(2)}`}
          color={unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        <StatCell label="Win Rate" value={`${winRate.toFixed(0)}%`}
          sub={`${wins.length}/${closedPositions.length}`} />
        <StatCell label="Profit Factor" value={profitFactor === Infinity ? '--' : profitFactor.toFixed(2)} />
      </div>

      {openPositions.length > 0 && (
        <div className="p-3">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-2">
            Open Positions ({openPositions.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--text-muted)]">
                  <th className="text-left py-1 font-medium">Side</th>
                  <th className="text-right py-1 font-medium">Entry</th>
                  <th className="text-right py-1 font-medium">Current</th>
                  <th className="text-right py-1 font-medium">Qty</th>
                  <th className="text-right py-1 font-medium">P&L</th>
                  <th className="text-right py-1 font-medium">P&L %</th>
                  <th className="text-right py-1 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map((pos) => {
                  const pnl = pos.side === 'long'
                    ? (currentPrice - pos.entryPrice) * pos.quantity
                    : (pos.entryPrice - currentPrice) * pos.quantity;
                  const pnlPct = (pnl / (pos.entryPrice * pos.quantity)) * 100;
                  const color = pnl >= 0 ? 'text-emerald-400' : 'text-red-400';
                  return (
                    <tr key={pos.id} className="border-t border-[var(--border)]">
                      <td className={`py-1.5 font-semibold ${pos.side === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pos.side.toUpperCase()}
                      </td>
                      <td className="text-right py-1.5 font-mono text-[var(--text-primary)]">${pos.entryPrice.toFixed(2)}</td>
                      <td className="text-right py-1.5 font-mono text-[var(--text-primary)]">${currentPrice.toFixed(2)}</td>
                      <td className="text-right py-1.5 text-[var(--text-secondary)]">{pos.quantity}</td>
                      <td className={`text-right py-1.5 font-mono font-semibold ${color}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </td>
                      <td className={`text-right py-1.5 font-mono ${color}`}>
                        {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                      </td>
                      <td className="text-right py-1.5">
                        <button onClick={() => closePosition(pos.id)}
                          className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors text-[10px] font-semibold uppercase">
                          Close
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {closedPositions.length > 0 && (
        <div className="border-t border-[var(--border)] p-3">
          <button
            onClick={() => setShowClosed(!showClosed)}
            className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
          >
            Closed Positions ({closedPositions.length})
            <svg className={`w-3 h-3 transition-transform ${showClosed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showClosed && (
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--text-muted)]">
                    <th className="text-left py-1 font-medium">Side</th>
                    <th className="text-right py-1 font-medium">Entry</th>
                    <th className="text-right py-1 font-medium">Exit</th>
                    <th className="text-right py-1 font-medium">Qty</th>
                    <th className="text-right py-1 font-medium">P&L</th>
                    <th className="text-right py-1 font-medium">P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {[...closedPositions].reverse().map((pos) => {
                    const color = (pos.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400';
                    return (
                      <tr key={pos.id} className="border-t border-[var(--border)]">
                        <td className={`py-1.5 font-semibold ${pos.side === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pos.side.toUpperCase()}
                        </td>
                        <td className="text-right py-1.5 font-mono text-[var(--text-secondary)]">${pos.entryPrice.toFixed(2)}</td>
                        <td className="text-right py-1.5 font-mono text-[var(--text-secondary)]">${pos.exitPrice?.toFixed(2)}</td>
                        <td className="text-right py-1.5 text-[var(--text-secondary)]">{pos.quantity}</td>
                        <td className={`text-right py-1.5 font-mono font-semibold ${color}`}>
                          {(pos.pnl ?? 0) >= 0 ? '+' : ''}${pos.pnl?.toFixed(2)}
                        </td>
                        <td className={`text-right py-1.5 font-mono ${color}`}>
                          {(pos.pnlPct ?? 0) >= 0 ? '+' : ''}{pos.pnlPct?.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-[var(--bg-card)] px-3 py-2">
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-bold font-mono ${color || 'text-[var(--text-primary)]'}`}>{value}</div>
      {sub && <div className={`text-[10px] font-mono ${color || 'text-[var(--text-muted)]'}`}>{sub}</div>}
    </div>
  );
}

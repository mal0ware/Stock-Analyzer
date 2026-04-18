import { useState } from 'react';
import { useSimulatorStore } from '../stores/simulatorStore';

type OrderTab = 'market' | 'limit' | 'bracket' | 'options';

/**
 * Re-render hygiene: every hook in this file reaches into the store via
 * a single-field selector so the per-tick state updates from ``tick()``
 * don't cascade into every form. Action functions have stable identity
 * in Zustand, so subscribing to them alone never triggers a re-render.
 */
const selectCurrentPrice = (s: ReturnType<typeof useSimulatorStore.getState>) =>
  s.currentIndex > 0 && s.allCandles[s.currentIndex - 1]
    ? s.allCandles[s.currentIndex - 1].close
    : 0;

function useCurrentPrice() {
  return useSimulatorStore(selectCurrentPrice);
}

export default function OrderPanel() {
  const [tab, setTab] = useState<OrderTab>('market');

  const tabs: { id: OrderTab; label: string }[] = [
    { id: 'market', label: 'Market' },
    { id: 'limit', label: 'Limit' },
    { id: 'bracket', label: 'Bracket' },
    { id: 'options', label: 'Options' },
  ];

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden h-full flex flex-col">
      <div className="flex border-b border-[var(--border)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
              tab === t.id
                ? 'text-[var(--accent)] border-b-2 border-[var(--accent)] bg-[var(--accent-soft)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        {tab === 'market' && <MarketOrderForm />}
        {tab === 'limit' && <LimitOrderForm />}
        {tab === 'bracket' && <BracketOrderForm />}
        {tab === 'options' && <OptionsForm />}
      </div>

      <PendingOrdersList />
    </div>
  );
}

function MarketOrderForm() {
  const [qty, setQty] = useState('1');
  const placeMarketOrder = useSimulatorStore((s) => s.placeMarketOrder);
  const cashBalance = useSimulatorStore((s) => s.cashBalance);
  const currentPrice = useCurrentPrice();

  const handleOrder = (side: 'buy' | 'sell') => {
    const q = parseInt(qty);
    if (q > 0) {
      placeMarketOrder(side, q);
      setQty('1');
    }
  };

  const maxShares = currentPrice > 0 ? Math.floor(cashBalance / currentPrice) : 0;
  const setQtyPct = (pct: number) => {
    const shares = Math.floor(maxShares * pct);
    if (shares > 0) setQty(String(shares));
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Current Price</div>
        <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
          ${currentPrice.toFixed(2)}
        </div>
      </div>

      <div>
        <label className="text-xs text-[var(--text-muted)] block mb-1">Quantity</label>
        <input
          type="number"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          min="1"
          className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
        />
        <div className="flex gap-1 mt-1.5">
          {([['25%', 0.25], ['50%', 0.5], ['75%', 0.75], ['Max', 1]] as [string, number][]).map(([label, pct]) => (
            <button key={label} onClick={() => setQtyPct(pct)}
              className="flex-1 py-1 rounded text-[10px] font-semibold text-[var(--text-muted)] bg-[var(--bg-primary)] hover:text-[var(--text-primary)] transition-colors">
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-[var(--text-muted)] space-y-0.5">
        <div className="flex justify-between">
          <span>Order Value</span>
          <span className="font-mono">${(currentPrice * (parseInt(qty) || 0)).toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Available</span>
          <span className="font-mono">${cashBalance.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Max Shares</span>
          <span className="font-mono">{maxShares}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => handleOrder('buy')}
          disabled={parseInt(qty) <= 0 || currentPrice * (parseInt(qty) || 0) > cashBalance}
          className="py-2.5 rounded-xl text-sm font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          BUY
        </button>
        <button
          onClick={() => handleOrder('sell')}
          disabled={parseInt(qty) <= 0}
          className="py-2.5 rounded-xl text-sm font-bold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          SHORT
        </button>
      </div>
    </div>
  );
}

function LimitOrderForm() {
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const placeLimitOrder = useSimulatorStore((s) => s.placeLimitOrder);
  const currentPrice = useCurrentPrice();

  const handleOrder = (side: 'buy' | 'sell') => {
    const p = parseFloat(price || String(currentPrice));
    const q = parseInt(qty);
    if (p > 0 && q > 0) {
      placeLimitOrder(side, p, q);
      setPrice('');
      setQty('1');
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-center text-xs text-[var(--text-muted)] mb-1">
        Current: <span className="font-mono text-[var(--text-primary)]">${currentPrice.toFixed(2)}</span>
      </div>
      <div>
        <label className="text-xs text-[var(--text-muted)] block mb-1">Limit Price</label>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={currentPrice.toFixed(2)}
          step="0.01"
          className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
        />
        <div className="flex gap-1 mt-1.5">
          {['-5%', '-2%', '-1%', '+1%', '+2%', '+5%'].map((label) => {
            const pct = parseFloat(label) / 100;
            return (
              <button key={label} onClick={() => setPrice((currentPrice * (1 + pct)).toFixed(2))}
                className={`flex-1 py-1 rounded text-[10px] font-semibold transition-colors ${
                  pct < 0
                    ? 'text-red-400/70 bg-red-500/5 hover:bg-red-500/10'
                    : 'text-emerald-400/70 bg-emerald-500/5 hover:bg-emerald-500/10'
                }`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className="text-xs text-[var(--text-muted)] block mb-1">Quantity</label>
        <input
          type="number"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          min="1"
          className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => handleOrder('buy')}
          className="py-2 rounded-xl text-sm font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors">
          BUY LIMIT
        </button>
        <button onClick={() => handleOrder('sell')}
          className="py-2 rounded-xl text-sm font-bold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">
          SELL LIMIT
        </button>
      </div>
    </div>
  );
}

function BracketOrderForm() {
  const [entry, setEntry] = useState('');
  const [slPct, setSlPct] = useState('5');
  const [tpPct, setTpPct] = useState('10');
  const [qty, setQty] = useState('1');
  const placeBracketOrder = useSimulatorStore((s) => s.placeBracketOrder);
  const currentPrice = useCurrentPrice();

  const entryPrice = parseFloat(entry) || currentPrice;
  const slPrice = entryPrice * (1 - parseFloat(slPct || '5') / 100);
  const tpPrice = entryPrice * (1 + parseFloat(tpPct || '10') / 100);
  const riskReward = parseFloat(slPct) > 0 ? (parseFloat(tpPct) / parseFloat(slPct)).toFixed(1) : '--';

  const handleOrder = (side: 'buy' | 'sell') => {
    const q = parseInt(qty);
    if (entryPrice > 0 && slPrice > 0 && tpPrice > 0 && q > 0) {
      placeBracketOrder(
        side,
        entryPrice,
        side === 'buy' ? slPrice : tpPrice,
        side === 'buy' ? tpPrice : slPrice,
        q,
      );
      setEntry('');
      setQty('1');
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-center text-xs text-[var(--text-muted)] mb-1">
        Current: <span className="font-mono text-[var(--text-primary)]">${currentPrice.toFixed(2)}</span>
      </div>
      <div>
        <label className="text-xs text-[var(--text-muted)] block mb-1">Entry Price</label>
        <input type="number" value={entry} onChange={(e) => setEntry(e.target.value)}
          placeholder={currentPrice.toFixed(2)} step="0.01"
          className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-red-400 block mb-1">Stop Loss %</label>
          <input type="number" value={slPct} onChange={(e) => setSlPct(e.target.value)}
            step="0.5" min="0.1"
            className="w-full bg-[var(--bg-primary)] border border-red-500/30 rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-red-400" />
          <div className="text-[10px] text-red-400/60 font-mono mt-0.5">${slPrice.toFixed(2)}</div>
        </div>
        <div>
          <label className="text-xs text-emerald-400 block mb-1">Take Profit %</label>
          <input type="number" value={tpPct} onChange={(e) => setTpPct(e.target.value)}
            step="0.5" min="0.1"
            className="w-full bg-[var(--bg-primary)] border border-emerald-500/30 rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-emerald-400" />
          <div className="text-[10px] text-emerald-400/60 font-mono mt-0.5">${tpPrice.toFixed(2)}</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] px-1">
        <span>R:R Ratio</span>
        <span className="font-mono font-semibold text-[var(--text-primary)]">{riskReward}:1</span>
      </div>
      <div>
        <label className="text-xs text-[var(--text-muted)] block mb-1">Quantity</label>
        <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} min="1"
          className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => handleOrder('buy')}
          className="py-2 rounded-xl text-sm font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors">
          BUY
        </button>
        <button onClick={() => handleOrder('sell')}
          className="py-2 rounded-xl text-sm font-bold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">
          SHORT
        </button>
      </div>
    </div>
  );
}

function OptionsForm() {
  const [type, setType] = useState<'call' | 'put'>('call');
  const [strike, setStrike] = useState('');
  const [contracts, setContracts] = useState('1');
  const placeMarketOrder = useSimulatorStore((s) => s.placeMarketOrder);
  const currentPrice = useCurrentPrice();

  const handleOrder = () => {
    const s = parseFloat(strike || String(currentPrice));
    const c = parseInt(contracts);
    if (s > 0 && c > 0) {
      const qty = c * 100;
      placeMarketOrder(type === 'call' ? 'buy' : 'sell', qty);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 bg-[var(--bg-primary)] rounded-xl p-1">
        <button
          onClick={() => setType('call')}
          className={`py-1.5 rounded-md text-xs font-bold transition-colors ${
            type === 'call' ? 'bg-emerald-500/20 text-emerald-400' : 'text-[var(--text-muted)]'
          }`}
        >
          CALL
        </button>
        <button
          onClick={() => setType('put')}
          className={`py-1.5 rounded-md text-xs font-bold transition-colors ${
            type === 'put' ? 'bg-red-500/20 text-red-400' : 'text-[var(--text-muted)]'
          }`}
        >
          PUT
        </button>
      </div>
      <div>
        <label className="text-xs text-[var(--text-muted)] block mb-1">Strike Price</label>
        <input type="number" value={strike} onChange={(e) => setStrike(e.target.value)}
          placeholder={currentPrice.toFixed(2)} step="0.50"
          className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" />
      </div>
      <div>
        <label className="text-xs text-[var(--text-muted)] block mb-1">Contracts (x100 shares)</label>
        <input type="number" value={contracts} onChange={(e) => setContracts(e.target.value)} min="1"
          className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" />
      </div>
      <button onClick={handleOrder}
        className={`w-full py-2.5 rounded-xl text-sm font-bold transition-colors ${
          type === 'call'
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
            : 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
        }`}>
        {type === 'call' ? 'BUY CALL' : 'BUY PUT'}
      </button>
      <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
        Simplified options: intrinsic value only. No time decay or Greeks.
      </p>
    </div>
  );
}

function PendingOrdersList() {
  const pendingOrders = useSimulatorStore((s) => s.pendingOrders);
  const cancelOrder = useSimulatorStore((s) => s.cancelOrder);

  if (pendingOrders.length === 0) return null;

  return (
    <div className="border-t border-[var(--border)] p-3">
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-2">
        Pending Orders ({pendingOrders.length})
      </div>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {pendingOrders.map((o) => (
          <div key={o.id} className="flex items-center justify-between text-xs py-1">
            <div className="flex items-center gap-2">
              <span className={o.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                {o.side.toUpperCase()}
              </span>
              <span className="text-[var(--text-secondary)] font-mono">${o.price.toFixed(2)}</span>
              <span className="text-[var(--text-muted)]">x{o.quantity}</span>
              {o.type === 'bracket' && (
                <span className="text-[var(--text-muted)]">
                  SL:{o.stopLoss?.toFixed(0)} TP:{o.takeProfit?.toFixed(0)}
                </span>
              )}
            </div>
            <button onClick={() => cancelOrder(o.id)}
              className="text-[var(--text-muted)] hover:text-red-400 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

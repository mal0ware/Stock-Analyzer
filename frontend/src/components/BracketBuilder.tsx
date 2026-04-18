import { useSimulatorStore } from '../stores/simulatorStore';

export default function BracketBuilder() {
  const draft = useSimulatorStore((s) => s.draftBracket);
  const updateDraft = useSimulatorStore((s) => s.updateDraftBracket);
  const confirmDraft = useSimulatorStore((s) => s.confirmDraftBracket);
  const cancelDraft = useSimulatorStore((s) => s.cancelDraftBracket);

  if (!draft) return null;

  const isLong = draft.side === 'buy';
  const risk = Math.abs(draft.entryPrice - draft.stopLoss);
  const reward = Math.abs(draft.takeProfit - draft.entryPrice);
  const rr = risk > 0 ? reward / risk : 0;
  const totalRisk = risk * draft.quantity;
  const totalReward = reward * draft.quantity;

  // Validate: for a long, SL < entry < TP. For a short, TP < entry < SL.
  const valid = isLong
    ? draft.stopLoss < draft.entryPrice && draft.takeProfit > draft.entryPrice && draft.quantity > 0
    : draft.stopLoss > draft.entryPrice && draft.takeProfit < draft.entryPrice && draft.quantity > 0;

  return (
    <div className="absolute top-3 left-3 z-30 w-72 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-xl shadow-black/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
          Bracket {isLong ? 'Long' : 'Short'}
        </span>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${isLong ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
          {isLong ? 'BUY' : 'SELL'}
        </span>
      </div>

      <div className="text-[11px] text-[var(--text-muted)] -mt-1">
        Drag the dashed lines on the chart to fine-tune entry, TP, and SL.
      </div>

      <div className="space-y-2">
        <PriceField
          label="Entry"
          value={draft.entryPrice}
          color="text-blue-400"
          onChange={(v) => updateDraft({ entryPrice: v })}
        />
        <PriceField
          label="Take Profit"
          value={draft.takeProfit}
          color="text-emerald-400"
          onChange={(v) => updateDraft({ takeProfit: v })}
        />
        <PriceField
          label="Stop Loss"
          value={draft.stopLoss}
          color="text-red-400"
          onChange={(v) => updateDraft({ stopLoss: v })}
        />
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Quantity</span>
          <input
            type="number"
            min={1}
            value={draft.quantity}
            onChange={(e) => updateDraft({ quantity: Math.max(0, Number(e.target.value)) })}
            className="w-24 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs font-mono text-right text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px bg-[var(--border)] rounded-lg overflow-hidden text-[10px]">
        <Stat label="R:R" value={rr > 0 ? rr.toFixed(2) : '—'} />
        <Stat label="Risk" value={`$${totalRisk.toFixed(2)}`} negative />
        <Stat label="Target" value={`$${totalReward.toFixed(2)}`} positive />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={cancelDraft}
          className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={confirmDraft}
          disabled={!valid}
          className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Place Order
        </button>
      </div>
    </div>
  );
}

function PriceField({ label, value, color, onChange }: { label: string; value: number; color: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={`text-[10px] uppercase tracking-wider font-semibold ${color}`}>{label}</span>
      <input
        type="number"
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs font-mono text-right text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
      />
    </div>
  );
}

function Stat({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  return (
    <div className="bg-[var(--bg-card)] px-2 py-1.5 text-center">
      <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className={`font-mono font-semibold ${positive ? 'text-emerald-400' : negative ? 'text-red-400' : 'text-[var(--text-primary)]'}`}>
        {value}
      </div>
    </div>
  );
}

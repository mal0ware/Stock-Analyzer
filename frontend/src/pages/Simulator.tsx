/**
 * Simulator — historical playback with order placement.
 *
 * Re-render strategy: the root component subscribes to store slices via
 * granular selectors so the 10 Hz ``tick()`` updates only re-render the
 * specific sub-trees that depend on the slice that changed. Action
 * functions have stable identity in Zustand, so subscribing to them
 * alone never triggers a re-render.
 *
 * Derived arrays (``visibleCandles``, ``priceLines``, ``orderBoxes``) are
 * recomputed on change via ``useMemo``; their deps are specific store
 * slices, not the whole store.
 */

import { useEffect, useMemo, useState } from 'react';
import { LineStyle } from 'lightweight-charts';

import { useSimulatorStore, type SimSpeed } from '../stores/simulatorStore';
import CandlestickChart, {
  type ChartType,
  type OHLCVData,
  type PriceLineConfig,
} from '../components/CandlestickChart';
import OrderPanel from '../components/OrderPanel';
import PositionSidebar from '../components/PositionSidebar';
import ChartContextMenu from '../components/ChartContextMenu';
import BracketBuilder from '../components/BracketBuilder';
import { computeIndicators, type ChartBox, type IndicatorState } from '../lib/indicators';

const SPEEDS: SimSpeed[] = [1, 2, 5, 10];
const INTERVALS = [
  { value: '1d', label: 'Daily' },
  { value: '1h', label: 'Hourly' },
  { value: '15m', label: '15min' },
  { value: '5m', label: '5min' },
];

export default function Simulator() {
  // Setup slice (changes on form edits only)
  const symbol = useSimulatorStore((s) => s.symbol);
  const startDate = useSimulatorStore((s) => s.startDate);
  const endDate = useSimulatorStore((s) => s.endDate);
  const interval = useSimulatorStore((s) => s.interval);
  const setSetup = useSimulatorStore((s) => s.setSetup);

  // Data slice
  const allCandles = useSimulatorStore((s) => s.allCandles);
  const currentIndex = useSimulatorStore((s) => s.currentIndex);
  const dataLoaded = useSimulatorStore((s) => s.dataLoaded);
  const dataLoading = useSimulatorStore((s) => s.dataLoading);
  const dataError = useSimulatorStore((s) => s.dataError);
  const loadData = useSimulatorStore((s) => s.loadData);
  const reset = useSimulatorStore((s) => s.reset);

  // Playback slice
  const playing = useSimulatorStore((s) => s.playing);
  const speed = useSimulatorStore((s) => s.speed);
  const play = useSimulatorStore((s) => s.play);
  const pause = useSimulatorStore((s) => s.pause);
  const stepForward = useSimulatorStore((s) => s.stepForward);
  const stepBackward = useSimulatorStore((s) => s.stepBackward);
  const setSpeed = useSimulatorStore((s) => s.setSpeed);

  // Trading slice (reads for chart overlays)
  const pendingOrders = useSimulatorStore((s) => s.pendingOrders);
  const openPositions = useSimulatorStore((s) => s.openPositions);
  const draftBracket = useSimulatorStore((s) => s.draftBracket);
  const placeLimitOrder = useSimulatorStore((s) => s.placeLimitOrder);
  const cancelOrder = useSimulatorStore((s) => s.cancelOrder);
  const moveOrderPrice = useSimulatorStore((s) => s.moveOrderPrice);
  const updateOrderField = useSimulatorStore((s) => s.updateOrderField);
  const startDraftBracket = useSimulatorStore((s) => s.startDraftBracket);
  const updateDraftBracket = useSimulatorStore((s) => s.updateDraftBracket);

  const [simChartType, setSimChartType] = useState<ChartType>('candlestick');
  const [indicators, setIndicators] = useState<IndicatorState>({ fvg: false, volumeAnomalies: false, orderBlocks: false });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; price: number } | null>(null);
  const [setupOpen, setSetupOpen] = useState(true);

  useEffect(() => {
    if (dataLoaded) setSetupOpen(false);
  }, [dataLoaded]);

  useEffect(() => {
    return () => {
      const { playIntervalId } = useSimulatorStore.getState();
      if (playIntervalId) clearInterval(playIntervalId);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const s = useSimulatorStore.getState();
      if (!s.dataLoaded) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          s.playing ? s.pause() : s.play();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (!s.playing) s.stepForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (!s.playing) s.stepBackward();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visibleCandles: OHLCVData[] = useMemo(() => {
    return allCandles.slice(0, currentIndex).map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }, [allCandles, currentIndex]);

  const { boxes: indicatorBoxes, markers: indicatorMarkers } = useMemo(
    () => computeIndicators(visibleCandles, indicators),
    [visibleCandles, indicators],
  );

  const orderBoxes: ChartBox[] = useMemo(() => {
    const zoneBoxes: ChartBox[] = [];
    if (visibleCandles.length === 0) return zoneBoxes;
    const lastTime = visibleCandles[visibleCandles.length - 1].time;
    const firstTime = visibleCandles[Math.max(0, visibleCandles.length - 10)].time;

    for (const pos of openPositions) {
      if (pos.stopLoss != null && pos.takeProfit != null) {
        zoneBoxes.push({
          id: `zone-${pos.id}`,
          startTime: firstTime,
          endTime: lastTime,
          high: Math.max(pos.stopLoss, pos.takeProfit),
          low: Math.min(pos.stopLoss, pos.takeProfit),
          color: pos.side === 'long' ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
          label: pos.side === 'long' ? 'LONG Zone' : 'SHORT Zone',
          type: 'fvg',
        });
      }
    }

    for (const order of pendingOrders) {
      if (order.type === 'bracket' && order.stopLoss != null && order.takeProfit != null) {
        zoneBoxes.push({
          id: `bracket-${order.id}`,
          startTime: firstTime,
          endTime: lastTime,
          high: Math.max(order.stopLoss, order.takeProfit),
          low: Math.min(order.stopLoss, order.takeProfit),
          color: order.side === 'buy' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
          label: 'Bracket',
          type: 'fvg',
        });
      }
    }

    return zoneBoxes;
  }, [visibleCandles, openPositions, pendingOrders]);

  const allBoxes = useMemo(
    () => [...indicatorBoxes, ...orderBoxes],
    [indicatorBoxes, orderBoxes],
  );

  const priceLines: PriceLineConfig[] = useMemo(() => {
    const lines: PriceLineConfig[] = [];

    for (const order of pendingOrders) {
      lines.push({
        id: `order-${order.id}`,
        price: order.price,
        color: order.side === 'buy' ? '#10b981' : '#ef4444',
        title: `${order.side.toUpperCase()} ${order.type} @ $${order.price.toFixed(2)}`,
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        draggable: true,
      });
      if (order.stopLoss) {
        lines.push({
          id: `sl-${order.id}`,
          price: order.stopLoss,
          color: '#ef4444',
          title: `SL $${order.stopLoss.toFixed(2)}`,
          lineStyle: LineStyle.Dotted,
          lineWidth: 1,
          draggable: true,
        });
      }
      if (order.takeProfit) {
        lines.push({
          id: `tp-${order.id}`,
          price: order.takeProfit,
          color: '#10b981',
          title: `TP $${order.takeProfit.toFixed(2)}`,
          lineStyle: LineStyle.Dotted,
          lineWidth: 1,
          draggable: true,
        });
      }
    }

    for (const pos of openPositions) {
      lines.push({
        id: `entry-${pos.id}`,
        price: pos.entryPrice,
        color: '#3b82f6',
        title: `Entry $${pos.entryPrice.toFixed(2)}`,
        lineStyle: LineStyle.Solid,
        lineWidth: 1,
      });
      if (pos.stopLoss) {
        lines.push({
          id: `pos-sl-${pos.id}`,
          price: pos.stopLoss,
          color: '#ef4444',
          title: `SL $${pos.stopLoss.toFixed(2)}`,
          lineStyle: LineStyle.Dotted,
          lineWidth: 1,
        });
      }
      if (pos.takeProfit) {
        lines.push({
          id: `pos-tp-${pos.id}`,
          price: pos.takeProfit,
          color: '#10b981',
          title: `TP $${pos.takeProfit.toFixed(2)}`,
          lineStyle: LineStyle.Dotted,
          lineWidth: 1,
        });
      }
    }

    if (draftBracket) {
      const d = draftBracket;
      lines.push(
        {
          id: 'draft-entry', price: d.entryPrice, color: '#3b82f6',
          title: `Draft Entry $${d.entryPrice.toFixed(2)}`,
          lineStyle: LineStyle.Dashed, lineWidth: 2, draggable: true,
        },
        {
          id: 'draft-tp', price: d.takeProfit, color: '#10b981',
          title: `Draft TP $${d.takeProfit.toFixed(2)}`,
          lineStyle: LineStyle.Dashed, lineWidth: 2, draggable: true,
        },
        {
          id: 'draft-sl', price: d.stopLoss, color: '#ef4444',
          title: `Draft SL $${d.stopLoss.toFixed(2)}`,
          lineStyle: LineStyle.Dashed, lineWidth: 2, draggable: true,
        },
      );
    }

    return lines;
  }, [pendingOrders, openPositions, draftBracket]);

  const handlePriceLineMove = (id: string, newPrice: number) => {
    if (id === 'draft-entry') return updateDraftBracket({ entryPrice: newPrice });
    if (id === 'draft-tp') return updateDraftBracket({ takeProfit: newPrice });
    if (id === 'draft-sl') return updateDraftBracket({ stopLoss: newPrice });

    const slMatch = id.match(/^sl-(.+)$/);
    if (slMatch) return updateOrderField(slMatch[1], 'stopLoss', newPrice);

    const tpMatch = id.match(/^tp-(.+)$/);
    if (tpMatch) return updateOrderField(tpMatch[1], 'takeProfit', newPrice);

    const orderMatch = id.match(/^order-(.+)$/);
    if (orderMatch) return moveOrderPrice(orderMatch[1], newPrice);
  };

  const progress = allCandles.length > 0
    ? ((currentIndex / allCandles.length) * 100).toFixed(0)
    : '0';

  const currentCandleTime = currentIndex > 0 && allCandles[currentIndex - 1]
    ? allCandles[currentIndex - 1].time
    : null;

  return (
    <div className="space-y-3">
      {!dataLoaded ? (
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">
            Trading Simulator
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Backtest strategies with historical data. No real money.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{symbol}</span>
          <span className="text-xs text-[var(--text-muted)] font-mono">
            {startDate} → {endDate} · {interval}
          </span>
          <button
            onClick={() => setSetupOpen((v) => !v)}
            className="ml-auto px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text-primary)] transition-colors"
          >
            {setupOpen ? 'Hide Setup' : 'Edit Setup'}
          </button>
          <button
            onClick={() => reset()}
            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider text-red-400/70 border border-red-500/20 hover:bg-red-500/10 transition-colors"
          >
            Reset
          </button>
        </div>
      )}

      {(setupOpen || !dataLoaded) && (
        <div className="flex flex-wrap items-end gap-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4">
          <div>
            <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block mb-1">Symbol</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSetup('symbol', e.target.value.toUpperCase())}
              className="w-24 bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block mb-1">Start</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setSetup('startDate', e.target.value)}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block mb-1">End</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setSetup('endDate', e.target.value)}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block mb-1">Interval</label>
            <select
              value={interval}
              onChange={(e) => setSetup('interval', e.target.value)}
              className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              {INTERVALS.map((i) => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => loadData()}
            disabled={dataLoading}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {dataLoading ? 'Loading...' : 'Load Data'}
          </button>
        </div>
      )}

      {dataError && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {dataError}
        </div>
      )}

      {dataLoaded && (
        <>
          <div className="flex items-center gap-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl px-4 py-3">
            <div className="flex items-center gap-1">
              <button onClick={() => stepBackward()} title="Step back"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>

              <button
                onClick={() => (playing ? pause() : play())}
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
              >
                {playing ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <button onClick={() => stepForward()} title="Step forward"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>

            <div className="w-px h-6 bg-[var(--border)]" />

            <div className="flex items-center gap-1">
              <span className="text-xs text-[var(--text-muted)] mr-1">Speed:</span>
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-2 py-1 rounded text-xs font-mono font-semibold transition-colors ${
                    speed === s
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>

            <div className="w-px h-6 bg-[var(--border)]" />

            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex-1 h-1.5 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] rounded-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs font-mono text-[var(--text-muted)] whitespace-nowrap">
                {currentIndex}/{allCandles.length}
              </span>
            </div>

            {currentCandleTime && (
              <>
                <div className="w-px h-6 bg-[var(--border)]" />
                <span className="text-xs text-[var(--text-secondary)] font-mono whitespace-nowrap">
                  {currentCandleTime}
                </span>
              </>
            )}

            <div className="hidden md:flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] font-mono">Space</kbd>
              <span>play</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] font-mono ml-1">&larr;&rarr;</kbd>
              <span>step</span>
            </div>
          </div>

          <div className="flex gap-4" style={{ minHeight: '500px' }}>
            <div className="relative flex-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden min-w-0">
              {visibleCandles.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between gap-2 px-3 pt-2">
                    <div className="hidden sm:flex items-center gap-1">
                      <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold mr-1">Indicators</span>
                      {([
                        ['fvg', 'FVG'],
                        ['volumeAnomalies', 'Vol'],
                        ['orderBlocks', 'OB'],
                      ] as [keyof IndicatorState, string][]).map(([key, label]) => (
                        <button key={key}
                          onClick={() => setIndicators((prev) => ({ ...prev, [key]: !prev[key] }))}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase transition-all ${
                            indicators[key]
                              ? 'bg-[var(--accent)] text-white'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-primary)]'
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="hidden md:inline text-[10px] text-[var(--text-muted)] italic">
                        Right-click chart for actions
                      </span>
                      <div className="flex items-center gap-1">
                        {([['candlestick', 'Candles'], ['area', 'Line']] as [ChartType, string][]).map(([type, label]) => (
                          <button key={type} onClick={() => setSimChartType(type)}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase transition-colors ${
                              simChartType === type
                                ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                            }`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <CandlestickChart
                    data={visibleCandles}
                    chartType={simChartType}
                    priceLines={priceLines}
                    boxes={allBoxes}
                    markers={indicatorMarkers}
                    onPriceLineMove={handlePriceLineMove}
                    onContextMenu={({ price, clientX, clientY }) => setContextMenu({ price, x: clientX, y: clientY })}
                    height={470}
                    showVolume={true}
                    autoFit={false}
                  />
                  <BracketBuilder />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
                  Press Play to start simulation
                </div>
              )}
            </div>

            <div className="w-72 shrink-0 hidden lg:block">
              <OrderPanel />
            </div>
          </div>

          <div className="lg:hidden">
            <OrderPanel />
          </div>

          <PositionSidebar />
        </>
      )}

      {contextMenu && (
        <ChartContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: `Bracket Long @ $${contextMenu.price.toFixed(2)}`,
              hint: 'drag TP/SL',
              onClick: () => startDraftBracket('buy', contextMenu.price),
            },
            {
              label: `Bracket Short @ $${contextMenu.price.toFixed(2)}`,
              hint: 'drag TP/SL',
              onClick: () => startDraftBracket('sell', contextMenu.price),
            },
            {
              label: `Limit Buy @ $${contextMenu.price.toFixed(2)}`,
              onClick: () => placeLimitOrder('buy', contextMenu.price, 1),
            },
            {
              label: `Limit Sell @ $${contextMenu.price.toFixed(2)}`,
              onClick: () => placeLimitOrder('sell', contextMenu.price, 1),
            },
            ...(pendingOrders.length > 0 ? [{
              label: 'Cancel All Pending Orders',
              danger: true,
              onClick: () => pendingOrders.forEach((o) => cancelOrder(o.id)),
            }] : []),
          ]}
        />
      )}

      {!dataLoaded && !dataLoading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <svg className="w-20 h-20 text-[var(--text-muted)] opacity-30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
          <div className="text-center">
            <div className="text-lg font-semibold text-[var(--text-primary)]">Load Historical Data</div>
            <div className="text-sm text-[var(--text-muted)] mt-1 max-w-md">
              Choose a symbol and date range to begin backtesting. Place market, limit, or bracket orders
              and watch how they would have performed.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

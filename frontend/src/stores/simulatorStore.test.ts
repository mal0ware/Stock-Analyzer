/**
 * Trading simulator P&L math — the financial arithmetic the sidebar and
 * closed-trade history report to the user. Every dollar figure asserted
 * here is derived by hand from the fill rules documented in the store:
 *
 *  - market orders fill at the close of the last visible candle
 *  - limit/bracket orders fill at the order price when the candle range
 *    touches it
 *  - long exit credits sale proceeds; short exit debits the buyback cost
 *    (short-sale proceeds are credited to cash at entry)
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { useSimulatorStore, type SimCandle } from './simulatorStore';

function candle(
  time: string,
  open: number,
  high: number,
  low: number,
  close: number,
): SimCandle {
  return { time, open, high, low, close, volume: 1_000 };
}

/** Seed the store with candles and position the playhead on the last one. */
function seed(candles: SimCandle[]) {
  useSimulatorStore.setState({
    allCandles: candles,
    currentIndex: candles.length,
    dataLoaded: true,
  });
}

beforeEach(() => {
  useSimulatorStore.getState().reset();
});

describe('market orders', () => {
  it('opens a long at the last close and debits cash by cost', () => {
    seed([candle('2025-01-02', 100, 105, 95, 100)]);
    useSimulatorStore.getState().placeMarketOrder('buy', 10);

    const s = useSimulatorStore.getState();
    expect(s.openPositions).toHaveLength(1);
    expect(s.openPositions[0]).toMatchObject({
      side: 'long',
      entryPrice: 100,
      quantity: 10,
    });
    expect(s.cashBalance).toBe(10_000 - 100 * 10);
  });

  it('rejects a buy whose cost exceeds available cash', () => {
    seed([candle('2025-01-02', 100, 105, 95, 100)]);
    useSimulatorStore.getState().placeMarketOrder('buy', 101); // $10,100 > $10,000

    const s = useSimulatorStore.getState();
    expect(s.openPositions).toHaveLength(0);
    expect(s.cashBalance).toBe(10_000);
  });

  it('opens a short and credits the short-sale proceeds to cash', () => {
    seed([candle('2025-01-02', 100, 105, 95, 100)]);
    useSimulatorStore.getState().placeMarketOrder('sell', 10);

    const s = useSimulatorStore.getState();
    expect(s.openPositions[0]).toMatchObject({ side: 'short', entryPrice: 100 });
    expect(s.cashBalance).toBe(10_000 + 100 * 10);
  });
});

describe('closePosition P&L', () => {
  it('realizes long profit: pnl = (exit − entry) × qty and cash = initial + pnl', () => {
    seed([candle('2025-01-02', 100, 105, 95, 100)]);
    useSimulatorStore.getState().placeMarketOrder('buy', 10);

    // Price rises to 110.
    seed([candle('2025-01-02', 100, 105, 95, 100), candle('2025-01-03', 105, 112, 104, 110)]);
    useSimulatorStore.getState().closePosition(useSimulatorStore.getState().openPositions[0].id);

    const s = useSimulatorStore.getState();
    expect(s.openPositions).toHaveLength(0);
    expect(s.closedPositions).toHaveLength(1);
    expect(s.closedPositions[0].pnl).toBe(100); // (110 − 100) × 10
    expect(s.closedPositions[0].pnlPct).toBeCloseTo(10, 10); // 100 / 1000 × 100
    expect(s.cashBalance).toBe(10_100);
  });

  it('realizes long loss symmetrically', () => {
    seed([candle('2025-01-02', 100, 105, 95, 100)]);
    useSimulatorStore.getState().placeMarketOrder('buy', 10);

    seed([candle('2025-01-02', 100, 105, 95, 100), candle('2025-01-03', 98, 99, 89, 90)]);
    useSimulatorStore.getState().closePosition(useSimulatorStore.getState().openPositions[0].id);

    const s = useSimulatorStore.getState();
    expect(s.closedPositions[0].pnl).toBe(-100); // (90 − 100) × 10
    expect(s.closedPositions[0].pnlPct).toBeCloseTo(-10, 10);
    expect(s.cashBalance).toBe(9_900);
  });

  it('realizes short profit: cash ends at initial + (entry − exit) × qty', () => {
    seed([candle('2025-01-02', 100, 105, 95, 100)]);
    useSimulatorStore.getState().placeMarketOrder('sell', 10); // cash → 11,000

    // Price falls to 90; buying back costs 900.
    seed([candle('2025-01-02', 100, 105, 95, 100), candle('2025-01-03', 95, 96, 88, 90)]);
    useSimulatorStore.getState().closePosition(useSimulatorStore.getState().openPositions[0].id);

    const s = useSimulatorStore.getState();
    expect(s.closedPositions[0].pnl).toBe(100); // (100 − 90) × 10
    expect(s.cashBalance).toBe(10_100); // 11,000 − 900, NOT 11,900
  });

  it('realizes short loss: cash ends at initial − (exit − entry) × qty', () => {
    seed([candle('2025-01-02', 100, 105, 95, 100)]);
    useSimulatorStore.getState().placeMarketOrder('sell', 10); // cash → 11,000

    seed([candle('2025-01-02', 100, 105, 95, 100), candle('2025-01-03', 105, 112, 104, 110)]);
    useSimulatorStore.getState().closePosition(useSimulatorStore.getState().openPositions[0].id);

    const s = useSimulatorStore.getState();
    expect(s.closedPositions[0].pnl).toBe(-100); // (100 − 110) × 10
    expect(s.cashBalance).toBe(9_900); // 11,000 − 1,100
  });
});

describe('limit order fills during tick', () => {
  it('fills a buy limit at the order price when the candle low touches it', () => {
    seed([candle('2025-01-02', 100, 105, 95, 100), candle('2025-01-03', 99, 101, 94, 96)]);
    useSimulatorStore.setState({ currentIndex: 1 }); // next tick consumes candle #2
    useSimulatorStore.getState().placeLimitOrder('buy', 95, 10);

    useSimulatorStore.getState().tick();

    const s = useSimulatorStore.getState();
    expect(s.pendingOrders).toHaveLength(0);
    expect(s.openPositions[0]).toMatchObject({ side: 'long', entryPrice: 95, quantity: 10 });
    expect(s.cashBalance).toBe(10_000 - 95 * 10); // filled at limit, not close
  });

  it('leaves a buy limit pending while price stays above it', () => {
    seed([candle('2025-01-02', 100, 105, 95, 100), candle('2025-01-03', 100, 106, 98, 104)]);
    useSimulatorStore.setState({ currentIndex: 1 });
    useSimulatorStore.getState().placeLimitOrder('buy', 95, 10);

    useSimulatorStore.getState().tick();

    const s = useSimulatorStore.getState();
    expect(s.pendingOrders).toHaveLength(1);
    expect(s.openPositions).toHaveLength(0);
    expect(s.cashBalance).toBe(10_000);
  });

  it('keeps a touched buy limit pending when cash cannot cover the fill', () => {
    seed([candle('2025-01-02', 100, 105, 95, 100), candle('2025-01-03', 99, 101, 94, 96)]);
    useSimulatorStore.setState({ currentIndex: 1, cashBalance: 500 });
    useSimulatorStore.getState().placeLimitOrder('buy', 95, 10); // needs $950

    useSimulatorStore.getState().tick();

    const s = useSimulatorStore.getState();
    expect(s.pendingOrders).toHaveLength(1);
    expect(s.openPositions).toHaveLength(0);
    expect(s.cashBalance).toBe(500);
  });
});

describe('bracket stop-loss / take-profit exits', () => {
  it('exits a long at the stop-loss price and books the exact loss', () => {
    seed([candle('2025-01-02', 100, 105, 95, 100)]);
    useSimulatorStore.getState().placeMarketOrder('buy', 10); // cash → 9,000
    useSimulatorStore.setState({
      openPositions: useSimulatorStore
        .getState()
        .openPositions.map((p) => ({ ...p, stopLoss: 97, takeProfit: 106 })),
      allCandles: [
        candle('2025-01-02', 100, 105, 95, 100),
        candle('2025-01-03', 99, 100, 96, 98), // low 96 pierces the 97 stop
      ],
      currentIndex: 1,
    });

    useSimulatorStore.getState().tick();

    const s = useSimulatorStore.getState();
    expect(s.openPositions).toHaveLength(0);
    expect(s.closedPositions[0]).toMatchObject({ exitPrice: 97, pnl: -30 });
    expect(s.cashBalance).toBe(9_000 + 97 * 10); // 9,970 = 10,000 − 30
  });

  it('exits a long at the take-profit price and books the exact gain', () => {
    seed([candle('2025-01-02', 100, 105, 95, 100)]);
    useSimulatorStore.getState().placeMarketOrder('buy', 10);
    useSimulatorStore.setState({
      openPositions: useSimulatorStore
        .getState()
        .openPositions.map((p) => ({ ...p, stopLoss: 90, takeProfit: 106 })),
      allCandles: [
        candle('2025-01-02', 100, 105, 95, 100),
        candle('2025-01-03', 102, 107, 101, 105), // high 107 crosses the 106 target
      ],
      currentIndex: 1,
    });

    useSimulatorStore.getState().tick();

    const s = useSimulatorStore.getState();
    expect(s.closedPositions[0]).toMatchObject({ exitPrice: 106, pnl: 60 });
    expect(s.cashBalance).toBe(10_000 + 60);
  });

  it('prefers the stop-loss when one candle spans both stop and target', () => {
    seed([candle('2025-01-02', 100, 105, 95, 100)]);
    useSimulatorStore.getState().placeMarketOrder('buy', 10);
    useSimulatorStore.setState({
      openPositions: useSimulatorStore
        .getState()
        .openPositions.map((p) => ({ ...p, stopLoss: 97, takeProfit: 103 })),
      allCandles: [
        candle('2025-01-02', 100, 105, 95, 100),
        candle('2025-01-03', 100, 104, 96, 101), // touches 97 AND 103
      ],
      currentIndex: 1,
    });

    useSimulatorStore.getState().tick();

    expect(useSimulatorStore.getState().closedPositions[0].exitPrice).toBe(97);
  });

  it('closes a short via stop-loss with the buyback debited from cash', () => {
    seed([candle('2025-01-02', 100, 105, 95, 100)]);
    useSimulatorStore.getState().placeMarketOrder('sell', 10); // cash → 11,000
    useSimulatorStore.setState({
      openPositions: useSimulatorStore
        .getState()
        .openPositions.map((p) => ({ ...p, stopLoss: 103, takeProfit: 92 })),
      allCandles: [
        candle('2025-01-02', 100, 105, 95, 100),
        candle('2025-01-03', 101, 104, 100, 102), // high 104 pierces the 103 stop
      ],
      currentIndex: 1,
    });

    useSimulatorStore.getState().tick();

    const s = useSimulatorStore.getState();
    expect(s.closedPositions[0]).toMatchObject({ exitPrice: 103, pnl: -30 });
    expect(s.cashBalance).toBe(11_000 - 103 * 10); // 9,970 = 10,000 − 30
  });
});

describe('portfolio invariants', () => {
  it('final cash equals initial balance plus the sum of realized P&L', () => {
    // Long round trip then short round trip, all flat at the end.
    seed([candle('2025-01-02', 100, 105, 95, 100)]);
    const store = useSimulatorStore.getState;

    store().placeMarketOrder('buy', 5); // long 5 @ 100
    seed([candle('2025-01-02', 100, 105, 95, 100), candle('2025-01-03', 105, 112, 104, 110)]);
    store().closePosition(store().openPositions[0].id); // +50

    store().placeMarketOrder('sell', 4); // short 4 @ 110
    seed([
      candle('2025-01-02', 100, 105, 95, 100),
      candle('2025-01-03', 105, 112, 104, 110),
      candle('2025-01-04', 108, 109, 100, 102),
    ]);
    store().closePosition(store().openPositions[0].id); // +(110−102)×4 = +32

    const s = useSimulatorStore.getState();
    const realized = s.closedPositions.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
    expect(realized).toBe(82);
    expect(s.openPositions).toHaveLength(0);
    expect(s.cashBalance).toBe(s.initialBalance + realized);
  });

  it('a filled bracket entry that hits its stop in the same candle nets exactly the stop distance', () => {
    seed([candle('2025-01-02', 100, 105, 95, 100), candle('2025-01-03', 99, 100, 93, 94)]);
    useSimulatorStore.setState({ currentIndex: 1 });
    // Buy 10 @ 98 with stop 95: candle #2 fills the entry (low 93 ≤ 98)
    // and the stop (low 93 ≤ 95) in the same tick.
    useSimulatorStore.getState().placeBracketOrder('buy', 98, 95, 108, 10);

    useSimulatorStore.getState().tick();

    const s = useSimulatorStore.getState();
    expect(s.pendingOrders).toHaveLength(0);
    expect(s.openPositions).toHaveLength(0);
    expect(s.closedPositions[0]).toMatchObject({ entryPrice: 98, exitPrice: 95, pnl: -30 });
    expect(s.cashBalance).toBe(10_000 - 30);
  });
});

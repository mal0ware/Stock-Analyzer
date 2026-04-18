import { create } from 'zustand';
import * as api from '../lib/api';

export interface SimCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Order {
  id: string;
  type: 'market' | 'limit' | 'bracket';
  side: 'buy' | 'sell';
  price: number;
  stopLoss?: number;
  takeProfit?: number;
  quantity: number;
  status: 'pending' | 'filled' | 'cancelled';
  filledAt?: string;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  quantity: number;
  entryDate: string;
  exitPrice?: number;
  exitDate?: string;
  pnl?: number;
  pnlPct?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export type SimSpeed = 1 | 2 | 5 | 10;

export interface DraftBracket {
  side: 'buy' | 'sell';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
}

interface SimulatorState {
  // Setup
  symbol: string;
  startDate: string;
  endDate: string;
  interval: string;

  // Data
  allCandles: SimCandle[];
  currentIndex: number;
  dataLoaded: boolean;
  dataLoading: boolean;
  dataError: string;

  // Playback
  playing: boolean;
  speed: SimSpeed;
  playIntervalId: ReturnType<typeof setInterval> | null;

  // Portfolio
  initialBalance: number;
  cashBalance: number;

  // Orders & Positions
  pendingOrders: Order[];
  openPositions: Position[];
  closedPositions: Position[];

  // Draft bracket builder (created via right-click → confirmed/cancelled in builder UI)
  draftBracket: DraftBracket | null;

  // Actions
  setSetup: (field: string, value: string) => void;
  loadData: () => Promise<void>;
  play: () => void;
  pause: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  setSpeed: (speed: SimSpeed) => void;
  placeMarketOrder: (side: 'buy' | 'sell', quantity: number) => void;
  placeLimitOrder: (side: 'buy' | 'sell', price: number, quantity: number) => void;
  placeBracketOrder: (side: 'buy' | 'sell', entryPrice: number, stopLoss: number, takeProfit: number, quantity: number) => void;
  cancelOrder: (orderId: string) => void;
  moveOrderPrice: (orderId: string, newPrice: number) => void;
  updateOrderField: (orderId: string, field: 'price' | 'stopLoss' | 'takeProfit', value: number) => void;
  closePosition: (positionId: string) => void;

  // Draft bracket actions
  startDraftBracket: (side: 'buy' | 'sell', entryPrice: number) => void;
  updateDraftBracket: (patch: Partial<DraftBracket>) => void;
  confirmDraftBracket: () => void;
  cancelDraftBracket: () => void;

  tick: () => void;
  reset: () => void;
}

let nextId = 1;
const genId = () => `sim-${nextId++}`;

function speedToMs(speed: SimSpeed): number {
  switch (speed) {
    case 1: return 1000;
    case 2: return 500;
    case 5: return 200;
    case 10: return 100;
  }
}

export const useSimulatorStore = create<SimulatorState>()((set, get) => ({
  symbol: 'NVDA',
  startDate: '2025-01-02',
  endDate: '2025-04-01',
  interval: '1d',
  allCandles: [],
  currentIndex: 0,
  dataLoaded: false,
  dataLoading: false,
  dataError: '',
  playing: false,
  speed: 1,
  playIntervalId: null,
  initialBalance: 10000,
  cashBalance: 10000,
  pendingOrders: [],
  openPositions: [],
  closedPositions: [],
  draftBracket: null,

  setSetup: (field, value) => set({ [field]: value } as any),

  loadData: async () => {
    const { symbol, startDate, endDate, interval } = get();
    set({ dataLoading: true, dataError: '' });
    try {
      const res = await api.historyRange(symbol, startDate, endDate, interval);
      const candles: SimCandle[] = res.data.map((c) => ({
        time: c.date.includes(' ') ? c.date.split(' ')[0] : c.date,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
      set({
        allCandles: candles,
        currentIndex: Math.min(20, candles.length),
        dataLoaded: true,
        dataLoading: false,
        dataError: '',
        cashBalance: 10000,
        initialBalance: 10000,
        pendingOrders: [],
        openPositions: [],
        closedPositions: [],
      });
    } catch (e: any) {
      set({ dataLoading: false, dataError: e.message || 'Failed to load data' });
    }
  },

  play: () => {
    const { playing, speed } = get();
    if (playing) return;
    const id = setInterval(() => get().tick(), speedToMs(speed));
    set({ playing: true, playIntervalId: id });
  },

  pause: () => {
    const { playIntervalId } = get();
    if (playIntervalId) clearInterval(playIntervalId);
    set({ playing: false, playIntervalId: null });
  },

  stepForward: () => {
    get().tick();
  },

  stepBackward: () => {
    const { currentIndex } = get();
    if (currentIndex > 1) {
      set({ currentIndex: currentIndex - 1 });
    }
  },

  setSpeed: (speed) => {
    const { playing, playIntervalId } = get();
    if (playing && playIntervalId) {
      clearInterval(playIntervalId);
      const id = setInterval(() => get().tick(), speedToMs(speed));
      set({ speed, playIntervalId: id });
    } else {
      set({ speed });
    }
  },

  placeMarketOrder: (side, quantity) => {
    const { currentIndex, allCandles, cashBalance, symbol, openPositions } = get();
    const candle = allCandles[currentIndex - 1];
    if (!candle) return;

    const price = candle.close;
    const cost = price * quantity;

    if (side === 'buy' && cost > cashBalance) return;

    const position: Position = {
      id: genId(),
      symbol,
      side: side === 'buy' ? 'long' : 'short',
      entryPrice: price,
      quantity,
      entryDate: candle.time,
    };

    set({
      openPositions: [...openPositions, position],
      cashBalance: side === 'buy' ? cashBalance - cost : cashBalance + cost,
    });
  },

  placeLimitOrder: (side, price, quantity) => {
    const order: Order = {
      id: genId(),
      type: 'limit',
      side,
      price,
      quantity,
      status: 'pending',
    };
    set({ pendingOrders: [...get().pendingOrders, order] });
  },

  placeBracketOrder: (side, entryPrice, stopLoss, takeProfit, quantity) => {
    const order: Order = {
      id: genId(),
      type: 'bracket',
      side,
      price: entryPrice,
      stopLoss,
      takeProfit,
      quantity,
      status: 'pending',
    };
    set({ pendingOrders: [...get().pendingOrders, order] });
  },

  cancelOrder: (orderId) => {
    set({
      pendingOrders: get().pendingOrders.filter((o) => o.id !== orderId),
    });
  },

  moveOrderPrice: (orderId, newPrice) => {
    set({
      pendingOrders: get().pendingOrders.map((o) =>
        o.id === orderId ? { ...o, price: newPrice } : o,
      ),
    });
  },

  updateOrderField: (orderId, field, value) => {
    set({
      pendingOrders: get().pendingOrders.map((o) =>
        o.id === orderId ? { ...o, [field]: value } : o,
      ),
    });
  },

  startDraftBracket: (side, entryPrice) => {
    // Default to a 2% stop and 4% target (2:1 R:R) seeded from the click price
    const offset = entryPrice * 0.02;
    const stopLoss  = side === 'buy' ? entryPrice - offset : entryPrice + offset;
    const takeProfit = side === 'buy' ? entryPrice + offset * 2 : entryPrice - offset * 2;
    set({
      draftBracket: {
        side,
        entryPrice: Math.round(entryPrice * 100) / 100,
        stopLoss: Math.round(stopLoss * 100) / 100,
        takeProfit: Math.round(takeProfit * 100) / 100,
        quantity: 1,
      },
    });
  },

  updateDraftBracket: (patch) => {
    const cur = get().draftBracket;
    if (!cur) return;
    set({ draftBracket: { ...cur, ...patch } });
  },

  confirmDraftBracket: () => {
    const d = get().draftBracket;
    if (!d) return;
    if (d.quantity <= 0) return;
    get().placeBracketOrder(d.side, d.entryPrice, d.stopLoss, d.takeProfit, d.quantity);
    set({ draftBracket: null });
  },

  cancelDraftBracket: () => set({ draftBracket: null }),

  closePosition: (positionId) => {
    const { openPositions, closedPositions, cashBalance, allCandles, currentIndex } = get();
    const pos = openPositions.find((p) => p.id === positionId);
    if (!pos) return;

    const candle = allCandles[currentIndex - 1];
    if (!candle) return;

    const exitPrice = candle.close;
    const pnl = pos.side === 'long'
      ? (exitPrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - exitPrice) * pos.quantity;
    const pnlPct = (pnl / (pos.entryPrice * pos.quantity)) * 100;

    const closed: Position = {
      ...pos,
      exitPrice,
      exitDate: candle.time,
      pnl,
      pnlPct,
    };

    set({
      openPositions: openPositions.filter((p) => p.id !== positionId),
      closedPositions: [...closedPositions, closed],
      cashBalance: cashBalance + exitPrice * pos.quantity,
    });
  },

  tick: () => {
    const state = get();
    const { currentIndex, allCandles, pendingOrders, openPositions, closedPositions, cashBalance, symbol } = state;

    if (currentIndex >= allCandles.length) {
      state.pause();
      return;
    }

    const candle = allCandles[currentIndex];

    // Fast path: no orders or positions to process — just advance the index
    if (pendingOrders.length === 0 && openPositions.length === 0) {
      set({ currentIndex: currentIndex + 1 });
      return;
    }

    let pendingChanged = false;
    let positionsChanged = false;
    let newCash = cashBalance;

    const newPending: Order[] = [];
    const filledPositions: Position[] = [];

    // Check pending orders
    for (const order of pendingOrders) {
      let filled = false;

      if (order.type === 'limit' || order.type === 'bracket') {
        if (order.side === 'buy' && candle.low <= order.price) {
          filled = true;
        } else if (order.side === 'sell' && candle.high >= order.price) {
          filled = true;
        }
      }

      if (filled) {
        const cost = order.price * order.quantity;
        if (order.side === 'buy' && cost > newCash) {
          newPending.push(order);
          continue;
        }

        filledPositions.push({
          id: genId(),
          symbol,
          side: order.side === 'buy' ? 'long' : 'short',
          entryPrice: order.price,
          quantity: order.quantity,
          entryDate: candle.time,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
        });
        newCash = order.side === 'buy' ? newCash - cost : newCash + cost;
        pendingChanged = true;
      } else {
        newPending.push(order);
      }
    }

    // Merge newly filled positions with existing open
    const allOpen = filledPositions.length > 0
      ? [...openPositions, ...filledPositions]
      : openPositions;

    // Check SL/TP on open positions
    const stillOpen: Position[] = [];
    const newlyClosed: Position[] = [];

    for (const pos of allOpen) {
      let exitPrice: number | null = null;

      if (pos.stopLoss != null) {
        if (pos.side === 'long' && candle.low <= pos.stopLoss) {
          exitPrice = pos.stopLoss;
        } else if (pos.side === 'short' && candle.high >= pos.stopLoss) {
          exitPrice = pos.stopLoss;
        }
      }

      if (exitPrice == null && pos.takeProfit != null) {
        if (pos.side === 'long' && candle.high >= pos.takeProfit) {
          exitPrice = pos.takeProfit;
        } else if (pos.side === 'short' && candle.low <= pos.takeProfit) {
          exitPrice = pos.takeProfit;
        }
      }

      if (exitPrice != null) {
        const pnl = pos.side === 'long'
          ? (exitPrice - pos.entryPrice) * pos.quantity
          : (pos.entryPrice - exitPrice) * pos.quantity;
        const pnlPct = (pnl / (pos.entryPrice * pos.quantity)) * 100;
        newlyClosed.push({ ...pos, exitPrice, exitDate: candle.time, pnl, pnlPct });
        newCash += exitPrice * pos.quantity;
        positionsChanged = true;
      } else {
        stillOpen.push(pos);
      }
    }

    // Single batched state update
    const update: Partial<SimulatorState> = { currentIndex: currentIndex + 1 };

    if (pendingChanged || pendingOrders.length !== newPending.length) {
      update.pendingOrders = newPending;
    }
    if (positionsChanged || filledPositions.length > 0) {
      update.openPositions = stillOpen;
    }
    if (newlyClosed.length > 0) {
      update.closedPositions = [...closedPositions, ...newlyClosed];
    }
    if (newCash !== cashBalance) {
      update.cashBalance = newCash;
    }

    set(update);
  },

  reset: () => {
    const { playIntervalId } = get();
    if (playIntervalId) clearInterval(playIntervalId);
    set({
      allCandles: [],
      currentIndex: 0,
      dataLoaded: false,
      dataLoading: false,
      dataError: '',
      playing: false,
      playIntervalId: null,
      cashBalance: 10000,
      initialBalance: 10000,
      pendingOrders: [],
      openPositions: [],
      closedPositions: [],
      draftBracket: null,
    });
  },
}));

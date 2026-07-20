/**
 * useWebSocket reconnect logic — exercised against a scripted WebSocket
 * double with fake timers so the exact backoff schedule (500ms → 30s cap),
 * stale-link detection, and unmount teardown are all asserted directly.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWebSocket } from './useWebSocket';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  url: string;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    // Browser semantics: closing fires the close event asynchronously; the
    // hook's stale-check path relies on onclose running after close().
    this.onclose?.({ code: 1006 });
  }

  // --- test drivers ---
  serverOpen() {
    this.onopen?.();
  }

  serverClose(code = 1006) {
    this.onclose?.({ code });
  }

  serverMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  serverRaw(data: string) {
    this.onmessage?.({ data });
  }

  static last(): FakeWebSocket {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('connection lifecycle', () => {
  it('opens a socket for the symbol and reports connected once open', () => {
    const { result } = renderHook(() => useWebSocket('AAPL'));

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.last().url).toContain('/ws/stream/AAPL');
    expect(result.current.connected).toBe(false);

    act(() => FakeWebSocket.last().serverOpen());
    expect(result.current.connected).toBe(true);
  });

  it('does not open a socket when symbol is null', () => {
    renderHook(() => useWebSocket(null));
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('replies to server pings with a pong frame', () => {
    renderHook(() => useWebSocket('AAPL'));
    const ws = FakeWebSocket.last();
    act(() => ws.serverOpen());

    act(() => ws.serverMessage({ type: 'ping' }));

    expect(ws.sent).toContain(JSON.stringify({ type: 'pong' }));
  });

  it('publishes price ticks and merges trend frames into existing data', () => {
    const { result } = renderHook(() => useWebSocket('AAPL'));
    const ws = FakeWebSocket.last();
    act(() => ws.serverOpen());

    // A trend frame before any price tick must not fabricate data.
    act(() => ws.serverMessage({ type: 'trend', trend: 'uptrend', trend_confidence: 0.9 }));
    expect(result.current.data).toBeNull();

    act(() =>
      ws.serverMessage({
        symbol: 'AAPL',
        timestamp: 't1',
        price: 190.5,
        change_pct: 1.2,
        volume: 1000,
      }),
    );
    expect(result.current.data?.price).toBe(190.5);

    act(() => ws.serverMessage({ type: 'trend', trend: 'uptrend', trend_confidence: 0.9 }));
    expect(result.current.data).toMatchObject({
      price: 190.5,
      trend: 'uptrend',
      trend_confidence: 0.9,
    });
  });

  it('ignores malformed frames without crashing or clearing state', () => {
    const { result } = renderHook(() => useWebSocket('AAPL'));
    const ws = FakeWebSocket.last();
    act(() => ws.serverOpen());
    act(() =>
      ws.serverMessage({ symbol: 'AAPL', timestamp: 't1', price: 10, change_pct: 0, volume: 1 }),
    );

    act(() => ws.serverRaw('{not json'));

    expect(result.current.data?.price).toBe(10);
  });
});

describe('reconnect backoff', () => {
  it('schedules the first reconnect 500ms after an unexpected close', () => {
    const { result } = renderHook(() => useWebSocket('AAPL'));
    act(() => FakeWebSocket.last().serverOpen());

    act(() => FakeWebSocket.last().serverClose());
    expect(result.current.connected).toBe(false);
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => vi.advanceTimersByTime(499));
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1));
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('doubles the delay on successive failures (500 → 1000 → 2000)', () => {
    renderHook(() => useWebSocket('AAPL'));

    // Attempt 1 fails without ever opening.
    act(() => FakeWebSocket.last().serverClose());
    act(() => vi.advanceTimersByTime(500));
    expect(FakeWebSocket.instances).toHaveLength(2);

    // Attempt 2 fails: next delay is 1000ms.
    act(() => FakeWebSocket.last().serverClose());
    act(() => vi.advanceTimersByTime(999));
    expect(FakeWebSocket.instances).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeWebSocket.instances).toHaveLength(3);

    // Attempt 3 fails: next delay is 2000ms.
    act(() => FakeWebSocket.last().serverClose());
    act(() => vi.advanceTimersByTime(1999));
    expect(FakeWebSocket.instances).toHaveLength(3);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeWebSocket.instances).toHaveLength(4);
  });

  it('caps the backoff delay at 30 seconds', () => {
    renderHook(() => useWebSocket('AAPL'));

    // Burn through the whole schedule: 500,1k,2k,4k,8k,15k,30k…
    for (let i = 0; i < 8; i++) {
      act(() => FakeWebSocket.last().serverClose());
      act(() => vi.advanceTimersByTime(30_000));
    }
    const count = FakeWebSocket.instances.length;

    // Past the end of the schedule the delay must stay exactly 30s.
    act(() => FakeWebSocket.last().serverClose());
    act(() => vi.advanceTimersByTime(29_999));
    expect(FakeWebSocket.instances).toHaveLength(count);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeWebSocket.instances).toHaveLength(count + 1);
  });

  it('resets the backoff schedule after a successful open', () => {
    renderHook(() => useWebSocket('AAPL'));

    // Two failures move the schedule to 2000ms…
    act(() => FakeWebSocket.last().serverClose());
    act(() => vi.advanceTimersByTime(500));
    act(() => FakeWebSocket.last().serverClose());
    act(() => vi.advanceTimersByTime(1000));

    // …then a successful open resets it.
    act(() => FakeWebSocket.last().serverOpen());
    act(() => FakeWebSocket.last().serverClose());

    const count = FakeWebSocket.instances.length;
    act(() => vi.advanceTimersByTime(500)); // back to the first rung
    expect(FakeWebSocket.instances).toHaveLength(count + 1);
  });

  it('force-closes and reconnects a stale link that stops sending frames', () => {
    renderHook(() => useWebSocket('AAPL'));
    const ws = FakeWebSocket.last();
    act(() => ws.serverOpen());

    // Frames keep the link alive: just before the 75s stale deadline,
    // a message pushes the deadline out again.
    act(() => vi.advanceTimersByTime(74_000));
    act(() => ws.serverMessage({ type: 'ping' }));
    act(() => vi.advanceTimersByTime(74_000));
    expect(FakeWebSocket.instances).toHaveLength(1);

    // Silence past the deadline kills the socket and schedules a retry.
    act(() => vi.advanceTimersByTime(1_000));
    act(() => vi.advanceTimersByTime(500));
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('stops reconnecting once unmounted', () => {
    const { unmount } = renderHook(() => useWebSocket('AAPL'));
    act(() => FakeWebSocket.last().serverOpen());
    act(() => FakeWebSocket.last().serverClose()); // pending 500ms retry

    unmount();

    act(() => vi.advanceTimersByTime(120_000));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

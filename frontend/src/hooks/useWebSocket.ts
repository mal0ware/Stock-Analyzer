import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Shape of a single streaming tick published by the backend event bus.
 * `type` lets us route price vs trend updates without overwriting state.
 */
interface StreamData {
  symbol: string;
  timestamp: string;
  price: number;
  change_pct: number | null;
  volume: number | null;
  anomaly_score?: number;
  anomaly_flag?: boolean;
  trend?: string;
  trend_confidence?: number;
}

// Backoff schedule (ms) for successive reconnect attempts; caps at last entry.
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 15000, 30000];
// Close the socket if we go this long without any server frame (ping included).
const STALE_TIMEOUT_MS = 75_000;

export function useWebSocket(symbol: string | null) {
  const [data, setData] = useState<StreamData | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const staleTimerRef = useRef<number | null>(null);
  const closedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (staleTimerRef.current !== null) {
      window.clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!symbol) return;
    closedRef.current = false;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/stream/${symbol}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    const scheduleStaleCheck = () => {
      if (staleTimerRef.current !== null) window.clearTimeout(staleTimerRef.current);
      staleTimerRef.current = window.setTimeout(() => {
        // No frames in STALE_TIMEOUT_MS — assume link is dead, force reconnect.
        console.warn(`[ws] stale connection for ${symbol}, forcing reconnect`);
        try { ws.close(); } catch { /* noop */ }
      }, STALE_TIMEOUT_MS);
    };

    const scheduleReconnect = () => {
      if (closedRef.current) return;
      const delay = BACKOFF_MS[Math.min(attemptRef.current, BACKOFF_MS.length - 1)];
      attemptRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);
    };

    ws.onopen = () => {
      attemptRef.current = 0;
      setConnected(true);
      scheduleStaleCheck();
    };

    ws.onclose = (ev) => {
      setConnected(false);
      clearTimers();
      if (!closedRef.current) {
        console.warn(`[ws] closed (${ev.code}) for ${symbol}`);
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // `onclose` fires right after; let that path handle reconnect scheduling.
      console.error(`[ws] error on ${symbol}`);
    };

    ws.onmessage = (event) => {
      scheduleStaleCheck();
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.error) return;

        if (parsed.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        if (parsed.type === 'trend') {
          setData((prev) => prev
            ? { ...prev, trend: parsed.trend, trend_confidence: parsed.trend_confidence }
            : prev);
        } else {
          setData(parsed);
        }
      } catch {
        // malformed frame — ignore, the stream will recover on next tick
      }
    };
  }, [symbol, clearTimers]);

  useEffect(() => {
    connect();
    return () => {
      closedRef.current = true;
      clearTimers();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
        try { ws.close(); } catch { /* noop */ }
      }
      setConnected(false);
      attemptRef.current = 0;
    };
  }, [connect, clearTimers]);

  return { data, connected };
}

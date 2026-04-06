import { useEffect, useRef, useState, useCallback } from 'react';

interface StreamData {
  symbol: string;
  timestamp: string;
  price: number;
  change_pct: number | null;
  volume: number | null;
}

export function useWebSocket(symbol: string | null) {
  const [data, setData] = useState<StreamData | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!symbol) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/stream/${symbol}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (!parsed.error) setData(parsed);
      } catch { /* ignore parse errors */ }
    };
  }, [symbol]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [connect]);

  return { data, connected };
}

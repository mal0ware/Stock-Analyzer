const BASE = '/api';
const V2 = '/api/v1';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || body.error || res.statusText);
  }
  return res.json();
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || data.error || res.statusText);
  }
  return res.json();
}

// v1 endpoints
export const health = () => get<{ status: string; version: string }>(`${BASE}/health`);
export const search = (q: string) => get<{ results: SearchResult[] }>(`${BASE}/search?q=${encodeURIComponent(q)}`);
export const quote = (symbol: string) => get<QuoteData>(`${BASE}/quote/${symbol}`);
export const history = (symbol: string, period = '1mo') =>
  get<HistoryData>(`${BASE}/history/${symbol}?period=${period}`);
export const analysis = (symbol: string, period = '1mo') =>
  get<AnalysisData>(`${BASE}/analysis/${symbol}?period=${period}`);
export const interpret = (symbol: string) =>
  get<{ insights: string[] }>(`${BASE}/interpret/${symbol}`);
export const news = (symbol: string) =>
  get<{ articles: NewsArticle[] }>(`${BASE}/news/${symbol}`);
export const glossary = () => get<{ terms: GlossaryTerm[] }>(`${BASE}/glossary`);

// v2 endpoints
export const snapshot = (symbol: string) => get<SnapshotData>(`${V2}/symbols/${symbol}/snapshot`);
export const sentiment = (symbol: string) => get<SentimentData>(`${V2}/symbols/${symbol}/sentiment`);
export const anomalies = (limit = 50) => get<AnomaliesData>(`${V2}/anomalies?limit=${limit}`);
export const anomalyScan = (symbol: string, period: '1mo' | '6mo' | '1y' = '6mo') =>
  get<AnomalyScanData>(`${V2}/symbols/${symbol}/anomaly-scan?period=${period}`);
export const orderbook = (symbol: string, levels = 12) =>
  get<OrderBookData>(`${V2}/symbols/${symbol}/orderbook?levels=${levels}`);
export const marketOverview = () => get<MarketOverviewData>(`${V2}/market/overview`);
export const getWatchlist = () => get<WatchlistData>(`${V2}/watchlist`);
export const updateWatchlist = (symbol: string, action: 'add' | 'remove') =>
  post<{ status: string; symbol: string }>(`${V2}/watchlist`, { symbol, action });
export const historyV2 = (symbol: string, period = '1mo') =>
  get<HistoryV2Data>(`${V2}/symbols/${symbol}/history?period=${period}`);
export const historyRange = (symbol: string, start: string, end: string, interval = '1d') =>
  get<HistoryV2Data>(`${V2}/symbols/${symbol}/history-range?start=${start}&end=${end}&interval=${interval}`);

// Types
export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export interface QuoteData {
  symbol: string;
  name: string;
  price: number;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  marketCap: number | null;
  sector: string | null;
  [key: string]: unknown;
}

export interface HistoryData {
  symbol: string;
  period: string;
  dates: string[];
  closes: number[];
  volumes: number[];
  opens: number[];
  highs: number[];
  lows: number[];
}

export interface SnapshotData {
  symbol: string;
  timestamp: string;
  price: {
    current: number;
    change_pct: number | null;
    volume: number;
    previous_close: number | null;
  };
  signals: {
    trend: string;
    trend_confidence: number;
    anomaly_score: number;
    anomaly_flag: boolean;
    probabilities?: Record<string, number>;
    method?: string;
  };
  sentiment: {
    news_score: number | null;
    social_score: number | null;
    composite: number | null;
    sample_size: number;
    label?: string;
    method?: string;
  };
}

export interface SentimentData {
  symbol: string;
  period: string;
  news: {
    available: boolean;
    headline_count: number;
    headlines: { title: string; source?: string; url?: string }[];
    score: number | null;
    label: string;
  };
  social: {
    available: boolean;
    post_count: number;
    score: number | null;
    label: string;
  };
  composite_score: number | null;
}

export interface AnomaliesData {
  anomalies: {
    symbol: string;
    anomaly_score: number;
    price_change_pct: number | null;
    volume_ratio: number | null;
    detected_at: string;
  }[];
  count: number;
}

export interface AnomalyScanBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AnomalyScore {
  date: string;
  score: number;
  flag: boolean;
  features: Record<string, number>;
  z_scores: Record<string, number>;
}

export interface AnomalyEvent {
  date: string;
  score: number;
  close: number;
  dominant_feature: string;
  dominant_z: number;
  features: Record<string, number>;
  z_scores: Record<string, number>;
}

export interface OrderBookLevel {
  price: number;
  size: number;
  cumulative: number;
}

export interface OrderBookData {
  symbol: string;
  mid: number;
  spread: number;
  spread_bps: number;
  tick_size: number;
  bid_levels: OrderBookLevel[];
  ask_levels: OrderBookLevel[];
  imbalance: number;
  synthetic: boolean;
  source_note: string;
}

export interface AnomalyScanData {
  symbol: string;
  period: string;
  interval: string;
  bars: AnomalyScanBar[];
  feature_cols: string[];
  scores: AnomalyScore[];
  events: AnomalyEvent[];
  thresholds: { flag: number; contamination: number };
}

export interface MarketMover {
  symbol: string;
  price: number;
  change_pct: number;
}

export interface MarketOverviewData {
  timestamp: string;
  sectors: {
    sector: string;
    etf: string;
    price: number | null;
    change_pct: number | null;
  }[];
  movers: {
    gainers: MarketMover[];
    losers: MarketMover[];
  };
}

export interface WatchlistData {
  symbols: { symbol: string; added_at: string }[];
  count: number;
}

export interface AnalysisData {
  trend: string;
  currentRsi: number | null;
  volatility: number | null;
  periodReturn: number | null;
  macd?: { histogram: number[] };
  supportResistance?: { support: number; resistance: number };
  sma20?: number[];
  sma50?: number[];
  [key: string]: unknown;
}

export interface NewsArticle {
  title: string;
  link: string;
  publisher: string;
  publishedAt?: string;
  thumbnail?: string;
}

export interface OHLCVCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoryV2Data {
  symbol: string;
  period?: string;
  interval: string;
  count: number;
  data: OHLCVCandle[];
}

export interface GlossaryTerm {
  name: string;
  category: string;
  definition: string;
  whyItMatters: string;
  ranges: string;
}

export function formatLargeNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

export function formatPct(n: number | null | undefined): string {
  if (n == null) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function pctColor(n: number | null | undefined): string {
  if (n == null) return 'text-gray-400';
  if (n > 0) return 'text-emerald-400';
  if (n < 0) return 'text-red-400';
  return 'text-gray-400';
}

export function trendColor(trend: string): string {
  if (trend.includes('uptrend')) return 'text-emerald-400';
  if (trend.includes('downtrend')) return 'text-red-400';
  return 'text-yellow-400';
}

export function sentimentColor(score: number | null): string {
  if (score == null) return 'text-gray-400';
  if (score > 0.15) return 'text-emerald-400';
  if (score < -0.15) return 'text-red-400';
  return 'text-yellow-400';
}

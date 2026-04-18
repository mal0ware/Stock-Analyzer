import type { OHLCVData } from '../components/CandlestickChart';

/** A box zone rendered on the chart */
export interface ChartBox {
  id: string;
  startTime: string;
  endTime: string;
  high: number;
  low: number;
  color: string;
  label: string;
  type: 'fvg' | 'volume' | 'orderblock';
}

/** A marker point on the chart */
export interface ChartMarker {
  time: string;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle';
  text: string;
}

/**
 * Fair Value Gap (FVG) detection.
 * Bullish FVG: candle[i-1].high < candle[i+1].low — gap up not filled
 * Bearish FVG: candle[i-1].low > candle[i+1].high — gap down not filled
 */
export function detectFVGs(data: OHLCVData[]): ChartBox[] {
  const boxes: ChartBox[] = [];
  if (data.length < 3) return boxes;

  for (let i = 1; i < data.length - 1; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    const next = data[i + 1];

    // Bullish FVG: gap between prev high and next low
    if (prev.high < next.low) {
      boxes.push({
        id: `fvg-bull-${i}`,
        startTime: curr.time,
        endTime: next.time,
        high: next.low,
        low: prev.high,
        color: 'rgba(16, 185, 129, 0.12)',
        label: 'FVG',
        type: 'fvg',
      });
    }

    // Bearish FVG: gap between prev low and next high
    if (prev.low > next.high) {
      boxes.push({
        id: `fvg-bear-${i}`,
        startTime: curr.time,
        endTime: next.time,
        high: prev.low,
        low: next.high,
        color: 'rgba(239, 68, 68, 0.12)',
        label: 'FVG',
        type: 'fvg',
      });
    }
  }

  return boxes;
}

/**
 * Volume anomaly detection.
 * Flags candles where volume exceeds 2x the 20-period moving average.
 */
export function detectVolumeAnomalies(data: OHLCVData[], threshold = 2.0, period = 20): ChartMarker[] {
  const markers: ChartMarker[] = [];
  if (data.length < period) return markers;

  for (let i = period; i < data.length; i++) {
    const vol = data[i].volume ?? 0;
    if (vol === 0) continue;

    let sum = 0;
    for (let j = i - period; j < i; j++) {
      sum += data[j].volume ?? 0;
    }
    const avg = sum / period;

    if (avg > 0 && vol > avg * threshold) {
      const ratio = (vol / avg).toFixed(1);
      const isUp = data[i].close >= data[i].open;
      markers.push({
        time: data[i].time,
        position: isUp ? 'belowBar' : 'aboveBar',
        color: isUp ? '#10b981' : '#ef4444',
        shape: 'circle',
        text: `${ratio}x vol`,
      });
    }
  }

  return markers;
}

/**
 * Order block detection.
 * An order block is the last opposing candle before a strong move.
 * Bullish OB: bearish candle followed by strong bullish move (>1.5x ATR)
 * Bearish OB: bullish candle followed by strong bearish move (>1.5x ATR)
 */
export function detectOrderBlocks(data: OHLCVData[], atrPeriod = 14): ChartBox[] {
  const boxes: ChartBox[] = [];
  if (data.length < atrPeriod + 2) return boxes;

  // Compute ATR
  const trs: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const tr = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close),
    );
    trs.push(tr);
  }

  for (let i = atrPeriod + 1; i < data.length - 1; i++) {
    // ATR at this point
    let atrSum = 0;
    for (let j = i - atrPeriod; j < i; j++) {
      atrSum += trs[j - 1] ?? 0;
    }
    const atr = atrSum / atrPeriod;
    if (atr <= 0) continue;

    const curr = data[i];
    const next = data[i + 1];
    const isCurrBearish = curr.close < curr.open;
    const isCurrBullish = curr.close > curr.open;
    const nextMove = next.close - next.open;

    // Bullish OB: bearish candle then strong bullish move
    if (isCurrBearish && nextMove > atr * 1.5) {
      // Extend forward to find how far the OB zone projects
      const endIdx = Math.min(i + 5, data.length - 1);
      boxes.push({
        id: `ob-bull-${i}`,
        startTime: curr.time,
        endTime: data[endIdx].time,
        high: curr.open,
        low: curr.close,
        color: 'rgba(59, 130, 246, 0.10)',
        label: 'OB',
        type: 'orderblock',
      });
    }

    // Bearish OB: bullish candle then strong bearish move
    if (isCurrBullish && nextMove < -atr * 1.5) {
      const endIdx = Math.min(i + 5, data.length - 1);
      boxes.push({
        id: `ob-bear-${i}`,
        startTime: curr.time,
        endTime: data[endIdx].time,
        high: curr.close,
        low: curr.open,
        color: 'rgba(249, 115, 22, 0.10)',
        label: 'OB',
        type: 'orderblock',
      });
    }
  }

  return boxes;
}

/** Which indicators are active */
export interface IndicatorState {
  fvg: boolean;
  volumeAnomalies: boolean;
  orderBlocks: boolean;
}

/** Compute all enabled indicators from data */
export function computeIndicators(
  data: OHLCVData[],
  enabled: IndicatorState,
): { boxes: ChartBox[]; markers: ChartMarker[] } {
  const boxes: ChartBox[] = [];
  const markers: ChartMarker[] = [];

  if (enabled.fvg) {
    boxes.push(...detectFVGs(data));
  }
  if (enabled.volumeAnomalies) {
    markers.push(...detectVolumeAnomalies(data));
  }
  if (enabled.orderBlocks) {
    boxes.push(...detectOrderBlocks(data));
  }

  return { boxes, markers };
}

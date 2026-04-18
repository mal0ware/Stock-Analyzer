import { useEffect, useMemo, useRef, useCallback } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IPriceLine,
  type SeriesMarker,
} from 'lightweight-charts';
import { useTheme } from '../hooks/useTheme';
import type { ChartBox, ChartMarker } from '../lib/indicators';

export type ChartType = 'candlestick' | 'line' | 'area';

export interface OHLCVData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface PriceLineConfig {
  id: string;
  price: number;
  color: string;
  title: string;
  lineStyle?: LineStyle;
  lineWidth?: number;
  draggable?: boolean;
}

export interface ForecastConfig {
  targetMean: number;
  targetHigh?: number;
  targetLow?: number;
}

interface Props {
  data: OHLCVData[];
  chartType?: ChartType;
  priceLines?: PriceLineConfig[];
  forecast?: ForecastConfig;
  boxes?: ChartBox[];
  markers?: ChartMarker[];
  onPriceLineMove?: (id: string, newPrice: number) => void;
  onContextMenu?: (e: { price: number; clientX: number; clientY: number }) => void;
  height?: number;
  showVolume?: boolean;
  autoFit?: boolean;
}

/**
 * Read the current theme's chart palette from the CSS custom properties
 * declared in ``index.css``. Adding a new theme is a one-file change —
 * bump ``[data-theme="..."]`` with the new ``--chart-*`` values and every
 * component (including this canvas-based chart) picks it up.
 *
 * ``getComputedStyle`` reflects the values applied by the active
 * ``data-theme`` attribute, so this is called after the attribute flips.
 */
function readChartPalette(): {
  bg: string; grid: string; text: string; border: string;
  upColor: string; downColor: string; upWick: string; downWick: string;
  volumeUp: string; volumeDown: string;
  lineColor: string; areaTop: string; areaBottom: string;
} {
  const styles = getComputedStyle(document.documentElement);
  const v = (name: string) => styles.getPropertyValue(name).trim();
  const up = v('--chart-up');
  const down = v('--chart-down');
  return {
    bg: v('--bg-primary'),
    grid: v('--border'),
    text: v('--text-muted'),
    border: v('--border'),
    upColor: up,
    downColor: down,
    upWick: up,
    downWick: down,
    volumeUp: v('--chart-volume-up'),
    volumeDown: v('--chart-volume-down'),
    lineColor: v('--chart-line'),
    areaTop: v('--chart-area-top'),
    areaBottom: v('--chart-area-bottom'),
  };
}

function generateFutureTimes(lastTime: string, steps: number, data: OHLCVData[]): string[] {
  const times: string[] = [];
  const isDateOnly = !lastTime.includes(' ') && !lastTime.includes('T');

  if (isDateOnly) {
    const d = new Date(lastTime + 'T12:00:00');
    let added = 0;
    while (added < steps) {
      d.setDate(d.getDate() + 1);
      const day = d.getDay();
      if (day === 0 || day === 6) continue;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      times.push(`${yyyy}-${mm}-${dd}`);
      added++;
    }
  } else {
    let intervalMs = 3600000;
    if (data.length >= 2) {
      const t1 = new Date(data[data.length - 2].time).getTime();
      const t2 = new Date(data[data.length - 1].time).getTime();
      if (t2 > t1) intervalMs = t2 - t1;
    }
    const base = new Date(lastTime).getTime();
    for (let i = 1; i <= steps; i++) {
      const future = new Date(base + intervalMs * i);
      times.push(future.toISOString().slice(0, 19).replace('T', ' '));
    }
  }
  return times;
}

export default function CandlestickChart({
  data,
  chartType = 'candlestick',
  priceLines,
  forecast,
  boxes,
  markers,
  onPriceLineMove,
  onContextMenu,
  height = 400,
  showVolume = true,
  autoFit = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Area'> | ISeriesApi<'Line'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const forecastMeanRef = useRef<ISeriesApi<'Line'> | null>(null);
  const forecastBandRef = useRef<ISeriesApi<'Area'> | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const dragRef = useRef<{ id: string; startY: number; startPrice: number } | null>(null);
  const prevDataLenRef = useRef(0);
  const rectCacheRef = useRef<{ rect: DOMRect; time: number } | null>(null);
  const chartTypeRef = useRef(chartType);
  const boxesRef = useRef<ChartBox[]>([]);
  const { theme } = useTheme();

  const colors = useMemo(() => readChartPalette(), [theme]);

  // Render box overlays using chart coordinate conversion
  const renderBoxes = useCallback(() => {
    const overlay = overlayRef.current;
    const chart = chartRef.current;
    const series = mainSeriesRef.current;
    if (!overlay || !chart || !series || !boxesRef.current.length) {
      if (overlay) overlay.innerHTML = '';
      return;
    }

    const timeScale = chart.timeScale();
    let html = '';

    for (const box of boxesRef.current) {
      const x1 = timeScale.timeToCoordinate(box.startTime as Time);
      const x2 = timeScale.timeToCoordinate(box.endTime as Time);
      const y1 = series.priceToCoordinate(box.high);
      const y2 = series.priceToCoordinate(box.low);

      if (x1 === null || x2 === null || y1 === null || y2 === null) continue;

      const left = Math.min(x1, x2);
      const width = Math.abs(x2 - x1);
      const top = Math.min(y1, y2);
      const h = Math.abs(y2 - y1);

      if (width < 1 || h < 1) continue;

      html += `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${h}px;background:${box.color};border-radius:3px;pointer-events:none;border:1px solid ${box.color.replace(/[\d.]+\)$/, '0.35)')};"><span style="position:absolute;top:1px;left:3px;font-size:9px;color:${box.color.replace(/[\d.]+\)$/, '0.7)')};font-weight:600;letter-spacing:0.5px">${box.label}</span></div>`;
    }

    overlay.innerHTML = html;
  }, []);

  // Recreate chart when chartType or showVolume changes
  useEffect(() => {
    if (!containerRef.current) return;
    chartTypeRef.current = chartType;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: colors.bg },
        textColor: colors.text,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: showVolume ? { top: 0.05, bottom: 0.25 } : { top: 0.05, bottom: 0.05 },
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    let mainSeries: any;
    if (chartType === 'candlestick') {
      mainSeries = chart.addCandlestickSeries({
        upColor: colors.upColor,
        downColor: colors.downColor,
        wickUpColor: colors.upWick,
        wickDownColor: colors.downWick,
        borderVisible: false,
      });
    } else if (chartType === 'area') {
      mainSeries = chart.addAreaSeries({
        lineColor: colors.lineColor,
        topColor: colors.areaTop,
        bottomColor: colors.areaBottom,
        lineWidth: 2,
      });
    } else {
      mainSeries = chart.addLineSeries({
        color: colors.lineColor,
        lineWidth: 2,
      });
    }

    let volumeSeries: ISeriesApi<'Histogram'> | null = null;
    if (showVolume) {
      volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
    }

    // Forecast projection series
    const forecastMean = chart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const forecastBand = chart.addAreaSeries({
      lineColor: 'rgba(59,130,246,0)',
      topColor: 'rgba(59,130,246,0.15)',
      bottomColor: 'rgba(59,130,246,0.03)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;
    mainSeriesRef.current = mainSeries;
    volumeSeriesRef.current = volumeSeries;
    forecastMeanRef.current = forecastMean;
    forecastBandRef.current = forecastBand;
    prevDataLenRef.current = 0;

    // Re-render boxes on visible range changes
    chart.timeScale().subscribeVisibleLogicalRangeChange(renderBoxes);
    chart.subscribeCrosshairMove(renderBoxes);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
      renderBoxes();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeSeriesRef.current = null;
      forecastMeanRef.current = null;
      forecastBandRef.current = null;
      priceLinesRef.current.clear();
      prevDataLenRef.current = 0;
    };
  }, [showVolume, chartType, renderBoxes]);

  // Update theme colors
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: colors.bg },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border },
    });
    if (chartTypeRef.current === 'candlestick') {
      (mainSeriesRef.current as ISeriesApi<'Candlestick'>)?.applyOptions({
        upColor: colors.upColor,
        downColor: colors.downColor,
        wickUpColor: colors.upWick,
        wickDownColor: colors.downWick,
      });
    } else if (chartTypeRef.current === 'area') {
      (mainSeriesRef.current as ISeriesApi<'Area'>)?.applyOptions({
        lineColor: colors.lineColor,
        topColor: colors.areaTop,
        bottomColor: colors.areaBottom,
      });
    } else {
      (mainSeriesRef.current as ISeriesApi<'Line'>)?.applyOptions({
        color: colors.lineColor,
      });
    }
  }, [theme, colors]);

  // Update data
  useEffect(() => {
    if (!mainSeriesRef.current || data.length === 0) return;

    const prevLen = prevDataLenRef.current;
    const isCandlestick = chartTypeRef.current === 'candlestick';

    if (isCandlestick && prevLen > 0 && data.length === prevLen + 1) {
      const d = data[data.length - 1];
      (mainSeriesRef.current as ISeriesApi<'Candlestick'>).update({
        time: d.time as Time,
        open: d.open, high: d.high, low: d.low, close: d.close,
      });
      if (volumeSeriesRef.current && showVolume) {
        volumeSeriesRef.current.update({
          time: d.time as Time, value: d.volume ?? 0,
          color: d.close >= d.open ? colors.volumeUp : colors.volumeDown,
        });
      }
    } else if (!isCandlestick && prevLen > 0 && data.length === prevLen + 1) {
      const d = data[data.length - 1];
      (mainSeriesRef.current as ISeriesApi<'Line'>).update({
        time: d.time as Time, value: d.close,
      });
      if (volumeSeriesRef.current && showVolume) {
        volumeSeriesRef.current.update({
          time: d.time as Time, value: d.volume ?? 0,
          color: d.close >= d.open ? colors.volumeUp : colors.volumeDown,
        });
      }
    } else {
      if (isCandlestick) {
        const candleData: CandlestickData<Time>[] = data.map((d) => ({
          time: d.time as Time,
          open: d.open, high: d.high, low: d.low, close: d.close,
        }));
        (mainSeriesRef.current as ISeriesApi<'Candlestick'>).setData(candleData);
      } else {
        const lineData: LineData<Time>[] = data.map((d) => ({
          time: d.time as Time, value: d.close,
        }));
        (mainSeriesRef.current as ISeriesApi<'Line'>).setData(lineData);
      }

      if (volumeSeriesRef.current && showVolume) {
        const volumeData: HistogramData<Time>[] = data.map((d) => ({
          time: d.time as Time, value: d.volume ?? 0,
          color: d.close >= d.open ? colors.volumeUp : colors.volumeDown,
        }));
        volumeSeriesRef.current.setData(volumeData);
      }

      if (autoFit) {
        chartRef.current?.timeScale().fitContent();
      }
    }

    prevDataLenRef.current = data.length;
  }, [data, showVolume, autoFit, colors.volumeUp, colors.volumeDown]);

  // Update markers
  useEffect(() => {
    const series = mainSeriesRef.current;
    if (!series) return;

    if (!markers || markers.length === 0) {
      series.setMarkers([]);
      return;
    }

    const lwMarkers: SeriesMarker<Time>[] = markers.map((m) => ({
      time: m.time as Time,
      position: m.position,
      color: m.color,
      shape: m.shape,
      text: m.text,
    }));

    // Sort by time (required by lightweight-charts)
    lwMarkers.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    series.setMarkers(lwMarkers);
  }, [markers, data]);

  // Update boxes ref and trigger render
  useEffect(() => {
    boxesRef.current = boxes || [];
    renderBoxes();
  }, [boxes, renderBoxes]);

  // Update forecast projection
  useEffect(() => {
    const meanSeries = forecastMeanRef.current;
    const bandSeries = forecastBandRef.current;
    if (!meanSeries || !bandSeries || data.length === 0) return;

    if (!forecast) {
      meanSeries.setData([]);
      bandSeries.setData([]);
      return;
    }

    const lastPoint = data[data.length - 1];
    const lastClose = lastPoint.close;
    const lastTime = lastPoint.time;

    const projSteps = Math.max(8, Math.round(data.length * 0.2));
    const futureTimes = generateFutureTimes(lastTime, projSteps, data);

    const meanPoints: LineData<Time>[] = [
      { time: lastTime as Time, value: lastClose },
    ];
    const bandPoints: LineData<Time>[] = [
      { time: lastTime as Time, value: lastClose },
    ];

    const high = forecast.targetHigh ?? forecast.targetMean;

    for (let i = 0; i < futureTimes.length; i++) {
      const t = (i + 1) / futureTimes.length;
      const eased = t * t * (3 - 2 * t);
      const meanVal = lastClose + (forecast.targetMean - lastClose) * eased;
      const highVal = lastClose + (high - lastClose) * eased;

      meanPoints.push({ time: futureTimes[i] as Time, value: meanVal });
      bandPoints.push({ time: futureTimes[i] as Time, value: highVal });
    }

    meanSeries.setData(meanPoints);
    bandSeries.setData(bandPoints);
  }, [data, forecast]);

  // Update price lines
  useEffect(() => {
    const series = mainSeriesRef.current;
    if (!series) return;

    const existingIds = new Set(priceLinesRef.current.keys());
    const newConfigs = priceLines || [];
    const newIds = new Set(newConfigs.map((pl) => pl.id));

    for (const id of existingIds) {
      if (!newIds.has(id)) {
        const line = priceLinesRef.current.get(id);
        if (line) series.removePriceLine(line);
        priceLinesRef.current.delete(id);
      }
    }

    for (const pl of newConfigs) {
      const existing = priceLinesRef.current.get(pl.id);
      if (existing) {
        existing.applyOptions({
          price: pl.price,
          color: pl.color,
          lineWidth: (pl.lineWidth ?? 1) as 1 | 2 | 3 | 4,
          lineStyle: pl.lineStyle ?? LineStyle.Dashed,
          title: pl.title,
        });
      } else {
        const line = series.createPriceLine({
          price: pl.price,
          color: pl.color,
          lineWidth: (pl.lineWidth ?? 1) as 1 | 2 | 3 | 4,
          lineStyle: pl.lineStyle ?? LineStyle.Dashed,
          axisLabelVisible: true,
          title: pl.title,
        });
        priceLinesRef.current.set(pl.id, line);
      }
    }
  }, [priceLines]);

  const getCachedRect = useCallback((): DOMRect | null => {
    if (!containerRef.current) return null;
    const now = performance.now();
    const cached = rectCacheRef.current;
    if (cached && now - cached.time < 200) return cached.rect;
    const rect = containerRef.current.getBoundingClientRect();
    rectCacheRef.current = { rect, time: now };
    return rect;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!onPriceLineMove || !priceLines || !mainSeriesRef.current || !chartRef.current) return;
    if (chartTypeRef.current !== 'candlestick') return;

    const rect = getCachedRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const series = mainSeriesRef.current as ISeriesApi<'Candlestick'>;
    const coordPrice = series.coordinateToPrice(y);
    if (coordPrice === null) return;

    const draggableLines = priceLines.filter((pl) => pl.draggable);
    let nearest: PriceLineConfig | null = null;
    let minDist = Infinity;

    for (const pl of draggableLines) {
      const plY = series.priceToCoordinate(pl.price);
      if (plY === null) continue;
      const dist = Math.abs(y - plY);
      if (dist < minDist && dist < 10) {
        minDist = dist;
        nearest = pl;
      }
    }

    if (nearest) {
      dragRef.current = { id: nearest.id, startY: y, startPrice: nearest.price };
      e.preventDefault();
    }
  }, [onPriceLineMove, priceLines, getCachedRect]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current || !mainSeriesRef.current || !containerRef.current) return;

    const rect = getCachedRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const series = mainSeriesRef.current as ISeriesApi<'Candlestick'>;
    const newPrice = series.coordinateToPrice(y);
    if (newPrice !== null && onPriceLineMove) {
      onPriceLineMove(dragRef.current.id, Math.round(newPrice * 100) / 100);
    }
  }, [onPriceLineMove, getCachedRect]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!onContextMenu || !mainSeriesRef.current) return;
    const rect = getCachedRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const series = mainSeriesRef.current;
    const price = series.coordinateToPrice(y);
    if (price === null) return;
    e.preventDefault();
    onContextMenu({ price: Math.round(price * 100) / 100, clientX: e.clientX, clientY: e.clientY });
  }, [onContextMenu, getCachedRect]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height, position: 'relative' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={handleContextMenu}
    >
      <div
        ref={overlayRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}
      />
    </div>
  );
}

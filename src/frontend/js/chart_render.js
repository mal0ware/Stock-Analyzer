/* Chart rendering module using Chart.js — with forecast projection */

const ChartRenderer = {
    priceChart: null,
    volumeChart: null,

    init() {
        const style = getComputedStyle(document.documentElement);
        Chart.defaults.color = style.getPropertyValue('--text-muted').trim() || '#6b6e85';
        Chart.defaults.borderColor = style.getPropertyValue('--border').trim() || '#2a2d3e';
        Chart.defaults.font.family = "'Inter', 'Segoe UI', system-ui, sans-serif";
    },

    renderPriceChart(canvasId, data, period, targets) {
        this.init();
        if (this.priceChart) { this.priceChart.destroy(); this.priceChart = null; }

        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const closes = data.closes.filter(v => v != null);
        if (closes.length === 0) return;

        const isUp = closes[closes.length - 1] >= closes[0];
        const mainColor = isUp ? getVar('--green', '#00d67e') : getVar('--red', '#ff6b6b');

        // Build datasets
        const datasets = [];
        const labels = [...data.dates];

        // Main price line
        datasets.push({
            label: 'Price',
            data: [...data.closes],
            borderColor: mainColor,
            backgroundColor: hexToRgba(mainColor, 0.08),
            fill: true,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: mainColor,
            borderWidth: 2,
        });

        // Forecast projection (only on 1mo+ periods if targets available)
        const showForecast = targets && targets.targetMean && targets.targetHigh && targets.targetLow
            && ['1mo', '6mo', '1y', '5y'].includes(period);

        if (showForecast) {
            const lastPrice = closes[closes.length - 1];
            const numPoints = Math.max(Math.round(labels.length * 0.25), 5);
            const forecastLabels = [];
            const lastDate = new Date(data.dates[data.dates.length - 1]);

            // Generate future date labels
            for (let i = 1; i <= numPoints; i++) {
                const d = new Date(lastDate);
                if (period === '5y') d.setDate(d.getDate() + i * 30);
                else if (period === '1y') d.setDate(d.getDate() + i * 7);
                else if (period === '6mo') d.setDate(d.getDate() + i * 5);
                else d.setDate(d.getDate() + i * 2);
                forecastLabels.push(d.toISOString().slice(0, 10));
            }

            // Pad main data with nulls for forecast period
            const mainPadded = [...data.closes, ...new Array(numPoints).fill(null)];

            // Build forecast curves (start from last real price, end at targets)
            const forecastMean = [null];
            const forecastHigh = [null];
            const forecastLow = [null];

            for (let i = 0; i <= numPoints; i++) {
                const t = i / numPoints;
                const mean = lastPrice + (targets.targetMean - lastPrice) * t;
                const high = lastPrice + (targets.targetHigh - lastPrice) * t;
                const low = lastPrice + (targets.targetLow - lastPrice) * t;
                if (i === 0) {
                    forecastMean[0] = mean;
                    forecastHigh[0] = high;
                    forecastLow[0] = low;
                } else {
                    forecastMean.push(mean);
                    forecastHigh.push(high);
                    forecastLow.push(low);
                }
            }

            // Prepend nulls for the historical period
            const histLen = data.closes.length;
            const padBefore = new Array(histLen - 1).fill(null);

            // Extend labels
            labels.push(...forecastLabels);

            // Update main dataset data
            datasets[0].data = mainPadded;

            // Forecast high (upper bound)
            datasets.push({
                label: 'Forecast High',
                data: [...padBefore, ...forecastHigh],
                borderColor: 'rgba(0, 180, 100, 0.4)',
                backgroundColor: 'rgba(0, 180, 100, 0.04)',
                fill: '+1',
                borderDash: [4, 4],
                borderWidth: 1.5,
                tension: 0.3,
                pointRadius: 0,
                pointHoverRadius: 3,
            });

            // Forecast low (lower bound) — fill between high and low
            datasets.push({
                label: 'Forecast Low',
                data: [...padBefore, ...forecastLow],
                borderColor: 'rgba(255, 107, 107, 0.4)',
                backgroundColor: 'transparent',
                fill: false,
                borderDash: [4, 4],
                borderWidth: 1.5,
                tension: 0.3,
                pointRadius: 0,
                pointHoverRadius: 3,
            });

            // Forecast mean (dashed center line)
            datasets.push({
                label: 'Target',
                data: [...padBefore, ...forecastMean],
                borderColor: getVar('--accent', '#6c5ce7'),
                backgroundColor: 'transparent',
                fill: false,
                borderDash: [6, 3],
                borderWidth: 2,
                tension: 0.3,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: getVar('--accent', '#6c5ce7'),
            });
        }

        this.priceChart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: getVar('--bg-secondary', '#181a24'),
                        titleColor: getVar('--text-primary', '#e8eaf0'),
                        bodyColor: getVar('--text-secondary', '#9a9db5'),
                        borderColor: getVar('--border', '#2a2d3e'),
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: function(ctx) {
                                if (ctx.raw == null) return null;
                                return `${ctx.dataset.label}: $${Number(ctx.raw).toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            maxTicksToShow: 8,
                            maxRotation: 0,
                            autoSkip: true,
                            autoSkipPadding: 40,
                            font: { size: 10 },
                            callback: function(val, idx) {
                                const lbl = this.getLabelForValue(val);
                                return ChartRenderer.formatLabel(lbl, period);
                            }
                        },
                        border: { display: false }
                    },
                    y: {
                        position: 'right',
                        grid: { color: getVar('--chart-grid', 'rgba(255,255,255,0.04)') },
                        ticks: {
                            font: { size: 10 },
                            callback: v => `$${v.toFixed(v >= 1000 ? 0 : 2)}`
                        },
                        border: { display: false }
                    }
                }
            }
        });
    },

    renderVolumeChart(canvasId, data, period) {
        this.init();
        if (this.volumeChart) { this.volumeChart.destroy(); this.volumeChart = null; }

        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const colors = data.volumes.map((v, i) => {
            if (i === 0) return 'rgba(108, 92, 231, 0.5)';
            const up = (data.closes[i] || 0) >= (data.closes[i - 1] || 0);
            return up ? 'rgba(0, 214, 126, 0.4)' : 'rgba(255, 107, 107, 0.4)';
        });

        this.volumeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.dates,
                datasets: [{
                    data: data.volumes,
                    backgroundColor: colors,
                    borderWidth: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: {
                    x: { display: false },
                    y: {
                        position: 'right',
                        grid: { color: getVar('--chart-grid', 'rgba(255,255,255,0.03)') },
                        ticks: {
                            maxTicksToShow: 3,
                            font: { size: 9 },
                            callback: v => ChartRenderer.formatNumber(v)
                        },
                        border: { display: false }
                    }
                }
            }
        });
    },

    formatLabel(dateStr, period) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            if (isNaN(d)) return dateStr.slice(5, 10);
            if (period === '1d' || period === '5d') {
                return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            }
            if (period === '5y') {
                return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
            }
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch (e) { return dateStr; }
    },

    formatNumber(num) {
        if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(0) + 'K';
        return num.toString();
    }
};

function getVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
}

function hexToRgba(color, alpha) {
    // Handle var() colors - just return a semi-transparent version
    if (color.startsWith('var(') || color.startsWith('rgb')) return color;
    if (color.startsWith('#')) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }
    return color;
}

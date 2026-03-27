// Chart rendering module using Chart.js

const ChartRenderer = {
    priceChart: null,
    volumeChart: null,

    init() {
        // Set Chart.js defaults for dark theme
        Chart.defaults.color = '#9a9db5';
        Chart.defaults.borderColor = '#2d3044';
        Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
    },

    renderPriceChart(canvasId, data, period) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        if (this.priceChart) {
            this.priceChart.destroy();
        }

        const ctx = canvas.getContext('2d');

        // Format labels based on period
        const labels = data.dates.map(d => this.formatLabel(d, period));

        // Determine color based on price direction
        const firstPrice = data.closes[0];
        const lastPrice = data.closes[data.closes.length - 1];
        const isPositive = lastPrice >= firstPrice;
        const lineColor = isPositive ? '#00d67e' : '#ff6b6b';
        const fillColor = isPositive ? 'rgba(0, 214, 126, 0.08)' : 'rgba(255, 107, 107, 0.08)';

        this.priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    data: data.closes,
                    borderColor: lineColor,
                    backgroundColor: fillColor,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: lineColor,
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e2130',
                        titleColor: '#e8eaf0',
                        bodyColor: '#e8eaf0',
                        borderColor: '#3a3d52',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return `$${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            maxTicksLimit: 8,
                            font: { size: 11 }
                        }
                    },
                    y: {
                        position: 'right',
                        grid: {
                            color: 'rgba(45, 48, 68, 0.5)',
                        },
                        ticks: {
                            font: { size: 11 },
                            callback: (val) => '$' + val.toFixed(2)
                        }
                    }
                }
            }
        });
    },

    renderVolumeChart(canvasId, data, period) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        if (this.volumeChart) {
            this.volumeChart.destroy();
        }

        const ctx = canvas.getContext('2d');
        const labels = data.dates.map(d => this.formatLabel(d, period));

        // Color bars based on price movement
        const colors = data.closes.map((close, i) => {
            if (i === 0) return 'rgba(108, 92, 231, 0.5)';
            return close >= data.closes[i - 1] ? 'rgba(0, 214, 126, 0.4)' : 'rgba(255, 107, 107, 0.4)';
        });

        this.volumeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: data.volumes,
                    backgroundColor: colors,
                    borderWidth: 0,
                    borderRadius: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e2130',
                        titleColor: '#e8eaf0',
                        bodyColor: '#e8eaf0',
                        borderColor: '#3a3d52',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return 'Vol: ' + ChartRenderer.formatNumber(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: false,
                    },
                    y: {
                        position: 'right',
                        grid: { color: 'rgba(45, 48, 68, 0.3)' },
                        ticks: {
                            font: { size: 10 },
                            callback: (val) => ChartRenderer.formatNumber(val),
                            maxTicksLimit: 3
                        }
                    }
                }
            }
        });
    },

    formatLabel(dateStr, period) {
        const d = new Date(dateStr);
        if (period === '1d' || period === '5d') {
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        if (period === '1mo') {
            return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
        if (period === '5y') {
            return d.toLocaleDateString([], { year: 'numeric', month: 'short' });
        }
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    },

    formatNumber(num) {
        if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
        if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
        return num.toString();
    }
};

ChartRenderer.init();

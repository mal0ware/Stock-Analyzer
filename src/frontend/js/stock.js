// Stock detail page logic

(function() {
    let currentSymbol = '';
    let currentPeriod = '1mo';

    document.addEventListener('DOMContentLoaded', () => {
        // Get symbol from URL
        const params = new URLSearchParams(window.location.search);
        currentSymbol = (params.get('s') || '').toUpperCase();

        if (!currentSymbol) {
            showError('No stock symbol provided.');
            return;
        }

        document.title = `${currentSymbol} - Stock Analyzer`;

        // Load all data
        loadStockData();

        // Period button handlers
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentPeriod = btn.dataset.period;
                loadChart();
            });
        });
    });

    async function loadStockData() {
        try {
            // Load quote first, then everything else in parallel
            const quoteResp = await fetch(`/api/quote/${currentSymbol}`);
            const quote = await quoteResp.json();

            if (quote.error) {
                showError(quote.error);
                return;
            }

            renderHeader(quote);
            renderStats(quote);
            showContent();

            // Load remaining data in parallel
            loadChart();
            loadAnalysis();
            loadInterpretation();
            loadNews();

        } catch (err) {
            console.error('Failed to load stock data:', err);
            showError('Failed to load stock data. Please try again.');
        }
    }

    function renderHeader(quote) {
        document.getElementById('stockName').textContent = quote.name || currentSymbol;
        document.getElementById('stockSymbol').textContent = currentSymbol;

        const meta = [];
        if (quote.exchange) meta.push(quote.exchange);
        if (quote.sector) meta.push(quote.sector);
        document.getElementById('stockMeta').textContent = meta.join(' • ');

        const priceEl = document.getElementById('stockPrice');
        priceEl.textContent = quote.price != null ? `$${quote.price.toFixed(2)}` : '--';

        const changeEl = document.getElementById('stockChange');
        if (quote.change != null && quote.changePercent != null) {
            const sign = quote.change >= 0 ? '+' : '';
            changeEl.textContent = `${sign}${quote.change.toFixed(2)} (${sign}${quote.changePercent.toFixed(2)}%)`;
            changeEl.className = 'stock-change ' + (quote.change >= 0 ? 'positive' : 'negative');
        } else {
            changeEl.textContent = '--';
        }
    }

    function renderStats(quote) {
        const grid = document.getElementById('statsGrid');
        const stats = [
            { label: 'Market Cap', value: formatLargeNum(quote.marketCap) },
            { label: 'P/E Ratio', value: formatNum(quote.peRatio, 2) },
            { label: 'Forward P/E', value: formatNum(quote.forwardPE, 2) },
            { label: 'EPS', value: quote.eps != null ? `$${quote.eps.toFixed(2)}` : '--' },
            { label: 'Volume', value: formatLargeNum(quote.volume) },
            { label: 'Avg Volume', value: formatLargeNum(quote.avgVolume) },
            { label: '52W High', value: quote.fiftyTwoWeekHigh != null ? `$${quote.fiftyTwoWeekHigh.toFixed(2)}` : '--' },
            { label: '52W Low', value: quote.fiftyTwoWeekLow != null ? `$${quote.fiftyTwoWeekLow.toFixed(2)}` : '--' },
            { label: 'Open', value: quote.open != null ? `$${quote.open.toFixed(2)}` : '--' },
            { label: 'Day High', value: quote.dayHigh != null ? `$${quote.dayHigh.toFixed(2)}` : '--' },
            { label: 'Day Low', value: quote.dayLow != null ? `$${quote.dayLow.toFixed(2)}` : '--' },
            { label: 'Beta', value: formatNum(quote.beta, 2) },
            { label: 'Dividend Yield', value: quote.dividendYield != null ? `${quote.dividendYield.toFixed(2)}%` : '--' },
            { label: 'Price/Book', value: formatNum(quote.priceToBook, 2) },
            { label: 'Profit Margin', value: quote.profitMargins != null ? `${(quote.profitMargins * 100).toFixed(1)}%` : '--' },
            { label: 'Debt/Equity', value: formatNum(quote.debtToEquity, 2) },
        ];

        grid.innerHTML = stats.map(s => `
            <div class="stat-card">
                <div class="stat-label">${s.label}</div>
                <div class="stat-value">${s.value}</div>
            </div>
        `).join('');
    }

    async function loadChart() {
        try {
            const resp = await fetch(`/api/history/${currentSymbol}?period=${currentPeriod}`);
            const data = await resp.json();

            if (data.error) {
                console.error('Chart error:', data.error);
                return;
            }

            ChartRenderer.renderPriceChart('priceChart', data, currentPeriod);
            ChartRenderer.renderVolumeChart('volumeChart', data, currentPeriod);
        } catch (err) {
            console.error('Chart load error:', err);
        }
    }

    async function loadAnalysis() {
        const grid = document.getElementById('technicalGrid');
        try {
            const resp = await fetch(`/api/analysis/${currentSymbol}?period=${currentPeriod}`);
            const data = await resp.json();

            if (data.error) {
                grid.innerHTML = `<p class="muted">${data.error}</p>`;
                return;
            }

            let html = '';

            // Trend
            if (data.trend) {
                const trendLabels = {
                    'uptrend': ['Uptrend', 'signal-bullish'],
                    'downtrend': ['Downtrend', 'signal-bearish'],
                    'sideways': ['Sideways', 'signal-neutral'],
                };
                const [label, cls] = trendLabels[data.trend] || ['Unknown', 'signal-neutral'];
                html += techItem('Trend', label, cls);
            }

            // RSI
            if (data.currentRsi != null) {
                let rsiSignal = 'signal-neutral';
                let rsiLabel = 'Neutral';
                if (data.currentRsi > 70) { rsiSignal = 'signal-bearish'; rsiLabel = 'Overbought'; }
                else if (data.currentRsi < 30) { rsiSignal = 'signal-bullish'; rsiLabel = 'Oversold'; }
                html += techItem('RSI (14)', data.currentRsi.toFixed(1), rsiSignal, rsiLabel);
            }

            // Volatility
            if (data.volatility != null) {
                let volSignal = 'signal-info';
                let volLabel = 'Normal';
                if (data.volatility > 3) { volSignal = 'signal-bearish'; volLabel = 'High'; }
                else if (data.volatility < 1) { volSignal = 'signal-bullish'; volLabel = 'Low'; }
                html += techItem('Volatility', data.volatility.toFixed(2) + '%', volSignal, volLabel);
            }

            // Period return
            if (data.periodReturn != null) {
                const retSign = data.periodReturn >= 0 ? '+' : '';
                const retCls = data.periodReturn >= 0 ? 'signal-bullish' : 'signal-bearish';
                html += techItem('Period Return', retSign + data.periodReturn.toFixed(2) + '%', retCls);
            }

            // MACD
            if (data.macd && data.macd.histogram && data.macd.histogram.length > 0) {
                const lastHist = data.macd.histogram[data.macd.histogram.length - 1];
                const macdCls = lastHist >= 0 ? 'signal-bullish' : 'signal-bearish';
                const macdLabel = lastHist >= 0 ? 'Bullish' : 'Bearish';
                html += techItem('MACD', lastHist.toFixed(2), macdCls, macdLabel);
            }

            // Support/Resistance
            if (data.supportResistance) {
                if (data.supportResistance.support != null) {
                    html += techItem('Support', '$' + data.supportResistance.support.toFixed(2), 'signal-info');
                }
                if (data.supportResistance.resistance != null) {
                    html += techItem('Resistance', '$' + data.supportResistance.resistance.toFixed(2), 'signal-info');
                }
            }

            // SMA
            if (data.sma20 && data.sma20.length > 0) {
                html += techItem('SMA 20', '$' + data.sma20[data.sma20.length - 1].toFixed(2), 'signal-info');
            }
            if (data.sma50 && data.sma50.length > 0) {
                html += techItem('SMA 50', '$' + data.sma50[data.sma50.length - 1].toFixed(2), 'signal-info');
            }

            grid.innerHTML = html || '<p class="muted">No technical data available.</p>';

        } catch (err) {
            console.error('Analysis error:', err);
            grid.innerHTML = '<p class="muted">Technical analysis unavailable.</p>';
        }
    }

    async function loadInterpretation() {
        const content = document.getElementById('interpretContent');
        try {
            const resp = await fetch(`/api/interpret/${currentSymbol}`);
            const data = await resp.json();

            if (data.insights && data.insights.length > 0) {
                content.innerHTML = data.insights.map(insight => `
                    <div class="insight-item">
                        <div class="insight-bullet"></div>
                        <div>${insight}</div>
                    </div>
                `).join('');
            } else {
                content.innerHTML = '<p class="muted">No analysis available for this stock.</p>';
            }
        } catch (err) {
            console.error('Interpretation error:', err);
            content.innerHTML = '<p class="muted">Analysis unavailable at this time.</p>';
        }
    }

    async function loadNews() {
        const content = document.getElementById('newsContent');
        try {
            const resp = await fetch(`/api/news/${currentSymbol}`);
            const data = await resp.json();

            if (data.articles && data.articles.length > 0) {
                content.innerHTML = data.articles.map(article => {
                    const thumbHtml = article.thumbnail
                        ? `<img class="news-thumb" src="${article.thumbnail}" alt="" loading="lazy">`
                        : '';
                    const onclick = article.link ? `onclick="window.open('${article.link}', '_blank')"` : '';
                    return `
                        <div class="news-item" ${onclick}>
                            ${thumbHtml}
                            <div class="news-info">
                                <div class="news-title">${escapeHtml(article.title)}</div>
                                <div class="news-source">${escapeHtml(article.publisher)}${article.publishedAt ? ' • ' + formatDate(article.publishedAt) : ''}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                content.innerHTML = '<div class="news-none">No recent news found for this stock.</div>';
            }
        } catch (err) {
            console.error('News error:', err);
            content.innerHTML = '<div class="news-none">News unavailable.</div>';
        }
    }

    // Helpers

    function showContent() {
        document.getElementById('loadingState').classList.add('hidden');
        document.getElementById('stockContent').classList.remove('hidden');
    }

    function showError(message) {
        document.getElementById('loadingState').classList.add('hidden');
        document.getElementById('errorState').classList.remove('hidden');
        document.getElementById('errorMessage').textContent = message;
    }

    function techItem(label, value, signalClass, signalText) {
        const signalHtml = signalText
            ? `<span class="tech-signal ${signalClass}">${signalText}</span>`
            : `<span class="tech-signal ${signalClass}">${value}</span>`;
        return `
            <div class="tech-item">
                <div class="tech-label">${label}</div>
                <div class="tech-value">${value}</div>
                ${signalText ? signalHtml : ''}
            </div>
        `;
    }

    function formatLargeNum(num) {
        if (num == null) return '--';
        if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
        if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
        if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
        if (num >= 1e3) return '$' + (num / 1e3).toFixed(1) + 'K';
        return num.toLocaleString();
    }

    function formatNum(num, decimals = 2) {
        if (num == null) return '--';
        return num.toFixed(decimals);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            const now = new Date();
            const diffMs = now - d;
            const diffHrs = Math.floor(diffMs / 3600000);
            if (diffHrs < 1) return 'Just now';
            if (diffHrs < 24) return `${diffHrs}h ago`;
            const diffDays = Math.floor(diffHrs / 24);
            if (diffDays < 7) return `${diffDays}d ago`;
            return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        } catch {
            return dateStr;
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
})();

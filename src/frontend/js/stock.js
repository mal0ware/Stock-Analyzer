/* Stock detail page — data loading, gauges, AI overview, strategy */
(function() {
    let currentSymbol = '';
    let currentPeriod = '1mo';
    let quoteData = null;
    let analysisData = null;

    document.addEventListener('DOMContentLoaded', function() {
        const params = new URLSearchParams(window.location.search);
        currentSymbol = (params.get('s') || '').toUpperCase();
        if (!currentSymbol) { showError('No stock symbol provided.'); return; }
        document.title = currentSymbol + ' — Stock Analyzer';
        loadStockData();

        var controls = document.getElementById('chartControls');
        if (controls) {
            controls.addEventListener('click', function(e) {
                var btn = e.target.closest('.period-btn');
                if (!btn) return;
                document.querySelectorAll('.period-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                currentPeriod = btn.dataset.period;
                loadChart();
            });
        }
    });

    async function loadStockData() {
        try {
            var res = await fetch('/api/quote/' + encodeURIComponent(currentSymbol));
            var quote = await res.json();
            if (quote.error) { showError(quote.error); return; }
            quoteData = quote;

            renderHeader(quote);
            renderDescription(quote);
            renderStats(quote);

            try { renderAnalystRating(quote); }
            catch(err) { resolveLoading('analystLoading', 'analystContent', 'Failed to render analyst data'); }

            showContent();

            loadChart();
            loadAnalysis();
            loadInterpretation();
            loadNews();
        } catch(e) {
            showError('Failed to load stock data.');
        }
    }

    function renderHeader(q) {
        setText('stockName', q.name || q.symbol);
        setText('stockSymbol', q.symbol);
        var parts = [q.exchange, q.sector, q.industry].filter(Boolean);
        setText('stockMeta', parts.join(' \u2022 '));
        setText('stockPrice', q.price != null ? '$' + fmt(q.price) : '--');

        var change = q.change, pct = q.changePercent;
        var el = document.getElementById('stockChange');
        if (el && change != null) {
            var sign = change >= 0 ? '+' : '';
            var cls = change >= 0 ? 'positive' : 'negative';
            el.innerHTML = '<span class="' + cls + '">' + sign + fmt(change) + ' (' + sign + fmt(pct) + '%)</span>';
        }
    }

    function renderDescription(q) {
        var el = document.getElementById('companyDescription');
        if (!el) return;
        var desc = q.description || '';
        if (!desc) { el.style.display = 'none'; return; }

        var short = desc.length > 250 ? desc.slice(0, 250) + '...' : desc;
        el.innerHTML = '<span id="descText">' + esc(short) + '</span>';
        if (desc.length > 250) {
            el.innerHTML += ' <span class="desc-toggle" id="descToggle">Show more</span>';
            var expanded = false;
            var toggle = document.getElementById('descToggle');
            if (toggle) {
                toggle.addEventListener('click', function() {
                    expanded = !expanded;
                    var dt = document.getElementById('descText');
                    if (dt) dt.textContent = expanded ? desc : short;
                    this.textContent = expanded ? 'Show less' : 'Show more';
                });
            }
        }
    }

    function renderStats(q) {
        var stats = [
            ['Market Cap', fmtLarge(q.marketCap)],
            ['P/E Ratio', fmt(q.peRatio)],
            ['Forward P/E', fmt(q.forwardPE)],
            ['EPS', q.eps != null ? '$' + fmt(q.eps) : '--'],
            ['Volume', fmtLarge(q.volume)],
            ['Avg Volume', fmtLarge(q.avgVolume)],
            ['52W High', q.fiftyTwoWeekHigh != null ? '$' + fmt(q.fiftyTwoWeekHigh) : '--'],
            ['52W Low', q.fiftyTwoWeekLow != null ? '$' + fmt(q.fiftyTwoWeekLow) : '--'],
            ['Open', q.open != null ? '$' + fmt(q.open) : '--'],
            ['Day High', q.dayHigh != null ? '$' + fmt(q.dayHigh) : '--'],
            ['Day Low', q.dayLow != null ? '$' + fmt(q.dayLow) : '--'],
            ['Beta', fmt(q.beta)],
            ['Dividend Yield', q.dividendYield != null ? fmt(q.dividendYield) + '%' : '--'],
            ['Price/Book', fmt(q.priceToBook)],
            ['Profit Margin', q.profitMargins != null ? fmt(q.profitMargins * 100) + '%' : '--'],
            ['Debt/Equity', fmt(q.debtToEquity)],
        ];
        var grid = document.getElementById('statsGrid');
        if (!grid) return;
        grid.innerHTML = stats.map(function(s) {
            return '<div class="stat-row"><span class="stat-label">' + s[0] + '</span><span class="stat-value">' + s[1] + '</span></div>';
        }).join('');
    }

    /* ============================================================
       ANALYST RATING — Gauge + reasons
       ============================================================ */
    function renderAnalystRating(q) {
        var container = document.getElementById('analystContent');
        var loading = document.getElementById('analystLoading');
        if (!container || !loading) return;

        var rec = q.recommendationKey || '';
        var mean = q.recommendationMean;
        var count = q.numberOfAnalystOpinions || 0;
        var targetHigh = q.targetHighPrice;
        var targetLow = q.targetLowPrice;
        var targetMean = q.targetMeanPrice;
        var price = q.price;

        if (!rec && !mean && count === 0) {
            loading.innerHTML = '<span class="muted">No analyst data available</span>';
            return;
        }

        var gaugeValue = 0.5;
        if (mean != null && mean > 0) {
            gaugeValue = 1 - ((mean - 1) / 4);
        }
        gaugeValue = Math.max(0, Math.min(1, gaugeValue));

        var label = ratingLabel(rec, gaugeValue);
        var color = gaugeColor(gaugeValue);

        var html = '';
        html += gaugeSVG(gaugeValue);
        html += '<div class="gauge-label" style="color:' + color + ';text-align:center">' + label + '</div>';
        html += '<div class="gauge-sublabel" style="text-align:center">' + count + ' analyst' + (count !== 1 ? 's' : '') + '</div>';

        if (targetMean != null && price != null && price > 0) {
            var upside = ((targetMean - price) / price * 100);
            html += '<div class="rating-details">';
            html += detailRow('Price Target', '$' + fmt(targetMean));
            html += detailRow('Upside', '<span class="' + (upside >= 0 ? 'positive' : 'negative') + '">' + (upside >= 0 ? '+' : '') + fmt(upside) + '%</span>');
            if (targetHigh != null) html += detailRow('High Target', '$' + fmt(targetHigh));
            if (targetLow != null) html += detailRow('Low Target', '$' + fmt(targetLow));
            html += '</div>';
        }

        var reasons = analystReasons(q);
        if (reasons.length > 0) {
            html += '<div class="rating-reasons">';
            html += '<div class="rating-reasons-title">Why analysts say ' + label.toLowerCase() + '</div>';
            for (var i = 0; i < reasons.length; i++) {
                html += '<div class="reason-item"><span class="reason-bullet"></span><span>' + esc(reasons[i]) + '</span></div>';
            }
            html += '</div>';
        }

        container.innerHTML = html;
        loading.classList.add('hidden');
        container.classList.remove('hidden');
    }

    function analystReasons(q) {
        var reasons = [];
        var price = q.price, target = q.targetMeanPrice;

        if (target != null && price != null && price > 0) {
            var upside = ((target - price) / price * 100);
            if (upside > 20) reasons.push('Significant upside potential of ' + fmt(upside) + '% to consensus target of $' + fmt(target));
            else if (upside > 5) reasons.push('Moderate upside of ' + fmt(upside) + '% to average price target of $' + fmt(target));
            else if (upside > -5) reasons.push('Trading near analyst consensus target of $' + fmt(target));
            else reasons.push('Trading ' + fmt(Math.abs(upside)) + '% above analyst target of $' + fmt(target) + ', suggesting limited upside');
        }

        if (q.revenueGrowth != null) {
            var rg = q.revenueGrowth * 100;
            if (rg > 15) reasons.push('Strong revenue growth of ' + fmt(rg) + '% signals expanding business');
            else if (rg > 0) reasons.push('Positive revenue growth of ' + fmt(rg) + '%');
            else if (rg < -5) reasons.push('Revenue declining at ' + fmt(rg) + '%, a concern for growth outlook');
        }

        if (q.earningsGrowth != null) {
            var eg = q.earningsGrowth * 100;
            if (eg > 20) reasons.push('Earnings growth of ' + fmt(eg) + '% shows strong profitability trajectory');
            else if (eg < -10) reasons.push('Earnings contracting at ' + fmt(eg) + '%, pressuring valuation');
        }

        if (q.peRatio != null && q.forwardPE != null && q.peRatio > 0 && q.forwardPE > 0) {
            if (q.forwardPE < q.peRatio * 0.85) reasons.push('Forward P/E of ' + fmt(q.forwardPE) + ' below trailing ' + fmt(q.peRatio) + ', implying expected earnings improvement');
        }

        if (q.profitMargins != null) {
            var pm = q.profitMargins * 100;
            if (pm > 20) reasons.push('High profit margins of ' + fmt(pm) + '% indicate pricing power');
            else if (pm < 0) reasons.push('Currently unprofitable with ' + fmt(pm) + '% margins');
        }

        return reasons.slice(0, 5);
    }

    /* ============================================================
       TECHNICAL RATING — Gauge + indicators
       ============================================================ */
    async function loadAnalysis() {
        try {
            var res = await fetch('/api/analysis/' + encodeURIComponent(currentSymbol) + '?period=' + currentPeriod);
            var data = await res.json();
            if (data.error) {
                resolveLoading('technicalLoading', 'technicalContent', 'No technical data available');
                generateOverview();
                return;
            }
            analysisData = data;

            try { renderTechnicalRating(data); }
            catch(err) { resolveLoading('technicalLoading', 'technicalContent', 'Failed to render technical data'); }

            try { generateOverview(); }
            catch(err) { resolveLoading('overviewLoading', 'overviewContent', 'Failed to generate overview'); }

        } catch(e) {
            resolveLoading('technicalLoading', 'technicalContent', 'Failed to load technical data');
            try { generateOverview(); }
            catch(err) { resolveLoading('overviewLoading', 'overviewContent', 'Failed to generate overview'); }
        }
    }

    function renderTechnicalRating(data) {
        var container = document.getElementById('technicalContent');
        var loading = document.getElementById('technicalLoading');
        if (!container || !loading) return;

        var signals = [];
        var rsi = data.currentRsi;
        if (rsi != null) {
            if (rsi < 30) signals.push(0.8);
            else if (rsi < 45) signals.push(0.65);
            else if (rsi < 55) signals.push(0.5);
            else if (rsi < 70) signals.push(0.35);
            else signals.push(0.15);
        }

        var trend = data.trend;
        if (trend === 'uptrend') signals.push(0.85);
        else if (trend === 'downtrend') signals.push(0.15);
        else signals.push(0.5);

        if (data.macd && data.macd.histogram && data.macd.histogram.length > 0) {
            var lastHist = data.macd.histogram[data.macd.histogram.length - 1];
            if (lastHist > 0) signals.push(0.75);
            else if (lastHist < 0) signals.push(0.25);
            else signals.push(0.5);
        }

        var periodReturn = data.periodReturn;
        if (periodReturn != null) {
            if (periodReturn > 10) signals.push(0.8);
            else if (periodReturn > 0) signals.push(0.6);
            else if (periodReturn > -10) signals.push(0.4);
            else signals.push(0.2);
        }

        var sum = 0;
        for (var i = 0; i < signals.length; i++) sum += signals[i];
        var gaugeValue = signals.length > 0 ? sum / signals.length : 0.5;
        var label = techLabel(gaugeValue);
        var color = gaugeColor(gaugeValue);

        var html = '';
        html += gaugeSVG(gaugeValue);
        html += '<div class="gauge-label" style="color:' + color + ';text-align:center">' + label + '</div>';
        html += '<div class="gauge-sublabel" style="text-align:center">Based on ' + signals.length + ' indicators</div>';

        html += '<div class="tech-indicators">';
        html += techRow('Trend', capitalize(trend || '--'), trendSignal(trend));
        if (rsi != null) html += techRow('RSI (14)', fmt(rsi), rsiSignal(rsi));
        if (data.macd && data.macd.histogram && data.macd.histogram.length > 0) {
            var last = data.macd.histogram[data.macd.histogram.length - 1];
            html += techRow('MACD', fmt(last), last > 0 ? 'bullish' : last < 0 ? 'bearish' : 'neutral');
        }
        html += techRow('Volatility', data.volatility != null ? fmt(data.volatility) + '%' : '--', null);
        html += techRow('Period Return', periodReturn != null ? (periodReturn >= 0 ? '+' : '') + fmt(periodReturn) + '%' : '--',
            periodReturn != null ? (periodReturn > 0 ? 'bullish' : periodReturn < 0 ? 'bearish' : 'neutral') : null);
        if (data.supportResistance) {
            html += techRow('Support', '$' + fmt(data.supportResistance.support), null);
            html += techRow('Resistance', '$' + fmt(data.supportResistance.resistance), null);
        }
        if (data.sma20 && data.sma20.length > 0) html += techRow('SMA 20', '$' + fmt(data.sma20[data.sma20.length - 1]), null);
        if (data.sma50 && data.sma50.length > 0) html += techRow('SMA 50', '$' + fmt(data.sma50[data.sma50.length - 1]), null);
        html += '</div>';

        container.innerHTML = html;
        loading.classList.add('hidden');
        container.classList.remove('hidden');
    }

    /* ============================================================
       AI OVERVIEW + STRATEGY
       ============================================================ */
    function generateOverview() {
        var container = document.getElementById('overviewContent');
        var loading = document.getElementById('overviewLoading');
        if (!container || !loading) return;

        if (!quoteData) {
            resolveLoading('overviewLoading', 'overviewContent', 'Insufficient data for overview');
            return;
        }

        var q = quoteData;
        var a = analysisData || {};
        var paragraphs = [];

        var sector = q.sector || 'N/A';
        var industry = q.industry || '';
        var mcap = q.marketCap;
        var sizeLabel = 'company';
        if (mcap) {
            if (mcap >= 200e9) sizeLabel = 'mega-cap company';
            else if (mcap >= 10e9) sizeLabel = 'large-cap company';
            else if (mcap >= 2e9) sizeLabel = 'mid-cap company';
            else if (mcap >= 300e6) sizeLabel = 'small-cap company';
            else sizeLabel = 'micro-cap company';
        }

        paragraphs.push(q.name + ' (' + q.symbol + ') is a ' + sizeLabel + ' in the ' + sector + (industry ? ' / ' + industry : '') + ' sector, currently trading at $' + fmt(q.price) + '.');

        if (q.fiftyTwoWeekHigh != null && q.fiftyTwoWeekLow != null && q.price != null) {
            var range = q.fiftyTwoWeekHigh - q.fiftyTwoWeekLow;
            var position = range > 0 ? ((q.price - q.fiftyTwoWeekLow) / range * 100) : 50;
            if (position > 85) paragraphs.push('The stock is trading near its 52-week high of $' + fmt(q.fiftyTwoWeekHigh) + ', indicating strong recent momentum but limited upside before hitting resistance.');
            else if (position < 15) paragraphs.push('The stock is near its 52-week low of $' + fmt(q.fiftyTwoWeekLow) + ', which could represent a value opportunity or a warning of continued deterioration.');
            else paragraphs.push('Trading at the ' + Math.round(position) + 'th percentile of its 52-week range ($' + fmt(q.fiftyTwoWeekLow) + ' \u2013 $' + fmt(q.fiftyTwoWeekHigh) + ').');
        }

        if (q.peRatio != null && q.peRatio > 0) {
            if (q.peRatio > 40) paragraphs.push('At a P/E ratio of ' + fmt(q.peRatio) + ', the stock is priced for significant growth. Value investors may see it as overextended.');
            else if (q.peRatio > 20) paragraphs.push('The P/E ratio of ' + fmt(q.peRatio) + ' suggests moderate valuation relative to earnings.');
            else paragraphs.push('With a P/E of ' + fmt(q.peRatio) + ', the stock appears reasonably valued.');
        } else if (q.peRatio != null && q.peRatio < 0) {
            paragraphs.push('The company has a negative P/E ratio, meaning it is currently unprofitable. Common for growth-stage companies.');
        }

        if (a.trend) {
            var rsiVal = a.currentRsi;
            var tech = 'Technically, the stock is in a' + (a.trend === 'uptrend' ? 'n uptrend' : a.trend === 'downtrend' ? ' downtrend' : ' sideways range');
            if (rsiVal != null) {
                if (rsiVal > 70) tech += ' with RSI at ' + fmt(rsiVal) + ' (overbought)';
                else if (rsiVal < 30) tech += ' with RSI at ' + fmt(rsiVal) + ' (oversold)';
                else tech += ' with RSI at ' + fmt(rsiVal) + ' (neutral)';
            }
            paragraphs.push(tech + '.');
        }

        // Strategy
        var strategy = '';
        var target = q.targetMeanPrice;
        var price = q.price;
        var rec = q.recommendationKey || '';

        if (target != null && price != null && price > 0) {
            var upside = ((target - price) / price * 100);
            var support = a.supportResistance ? a.supportResistance.support : null;
            var resistance = a.supportResistance ? a.supportResistance.resistance : null;

            if (upside > 30 && (rec === 'buy' || rec === 'strong_buy')) {
                strategy = 'Analysts see ' + fmt(upside) + '% upside to $' + fmt(target) + '. ';
                if (support) strategy += 'Consider entries near support at $' + fmt(support) + '. ';
                strategy += 'This is a longer-term conviction play \u2014 consider a 6\u201312 month hold.';
            } else if (upside > 10) {
                strategy = 'Consensus target of $' + fmt(target) + ' implies ' + fmt(upside) + '% upside. ';
                if (support && resistance) strategy += 'Support near $' + fmt(support) + ', resistance near $' + fmt(resistance) + '. ';
                strategy += 'A moderate position with a 3\u20136 month horizon could be appropriate.';
            } else if (upside > -5) {
                strategy = 'Trading close to the analyst target of $' + fmt(target) + '. Most of the move may be priced in. ';
                strategy += 'Watch for catalysts before committing new capital.';
            } else {
                strategy = 'Currently above consensus target of $' + fmt(target) + ' by ' + fmt(Math.abs(upside)) + '%. ';
                strategy += 'Consider trimming positions or setting stop-losses near support.';
            }
        } else if (a.trend === 'uptrend') {
            strategy = 'The stock is in an uptrend. Look for pullbacks to moving averages as entry points.';
        } else if (a.trend === 'downtrend') {
            strategy = 'The stock is in a downtrend. Wait for signs of reversal before entering.';
        } else {
            strategy = 'The stock is moving sideways. Range-bound strategies may be appropriate until a breakout occurs.';
        }

        var html = '<div class="overview-text">';
        for (var i = 0; i < paragraphs.length; i++) {
            html += '<p>' + esc(paragraphs[i]) + '</p>';
        }
        html += '</div>';
        if (strategy) {
            html += '<div class="strategy-highlight"><span class="strategy-icon">&#x1F4A1;</span><div>' + esc(strategy) + '</div></div>';
        }

        container.innerHTML = html;
        loading.classList.add('hidden');
        container.classList.remove('hidden');
    }

    /* ============================================================
       SVG GAUGE
       ============================================================ */
    function gaugeSVG(value) {
        value = Math.max(0, Math.min(1, value));
        var cx = 90, cy = 85, r = 70;
        var colors = ['#ff4444', '#ff8c42', '#888899', '#66cc66', '#00b368'];
        var segCount = 5;
        var gap = 0.02;
        var segArc = (Math.PI - gap * (segCount - 1)) / segCount;

        var arcs = '';
        for (var i = 0; i < segCount; i++) {
            var a1 = Math.PI - i * (segArc + gap);
            var a2 = a1 - segArc;
            var x1 = cx + r * Math.cos(a1), y1 = cy - r * Math.sin(a1);
            var x2 = cx + r * Math.cos(a2), y2 = cy - r * Math.sin(a2);
            arcs += '<path d="M ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' A ' + r + ' ' + r + ' 0 0 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + '" fill="none" stroke="' + colors[i] + '" stroke-width="10" stroke-linecap="round" opacity="0.7"/>';
        }

        var na = Math.PI - value * Math.PI;
        var nl = r - 16;
        var nx = cx + nl * Math.cos(na);
        var ny = cy - nl * Math.sin(na);
        var needle = '<line x1="' + cx + '" y1="' + cy + '" x2="' + nx.toFixed(2) + '" y2="' + ny.toFixed(2) + '" stroke="var(--text-primary)" stroke-width="2.5" stroke-linecap="round"/>';
        var dot = '<circle cx="' + cx + '" cy="' + cy + '" r="4" fill="var(--text-primary)"/>';

        return '<div class="gauge-container"><svg class="gauge-svg" viewBox="0 0 180 100">' + arcs + needle + dot + '</svg></div>';
    }

    function gaugeColor(v) {
        if (v >= 0.8) return 'var(--green)';
        if (v >= 0.6) return '#66cc66';
        if (v >= 0.4) return 'var(--text-secondary)';
        if (v >= 0.2) return '#ff8c42';
        return 'var(--red)';
    }

    function ratingLabel(rec, v) {
        if (rec === 'strong_buy') return 'Strong Buy';
        if (rec === 'buy') return 'Buy';
        if (rec === 'hold') return 'Hold';
        if (rec === 'sell' || rec === 'underperform') return 'Sell';
        if (rec === 'strong_sell') return 'Strong Sell';
        if (v >= 0.8) return 'Strong Buy';
        if (v >= 0.6) return 'Buy';
        if (v >= 0.4) return 'Hold';
        if (v >= 0.2) return 'Sell';
        return 'Strong Sell';
    }

    function techLabel(v) {
        if (v >= 0.75) return 'Strong Buy';
        if (v >= 0.6) return 'Buy';
        if (v >= 0.4) return 'Neutral';
        if (v >= 0.25) return 'Sell';
        return 'Strong Sell';
    }

    /* ============================================================
       INTERPRETATION
       ============================================================ */
    async function loadInterpretation() {
        try {
            var res = await fetch('/api/interpret/' + encodeURIComponent(currentSymbol));
            var data = await res.json();
            var list = document.getElementById('insightList');
            var loading = document.getElementById('insightsLoading');
            if (!list || !loading) return;
            if (data.insights && data.insights.length > 0) {
                list.innerHTML = data.insights.map(function(item) {
                    return '<div class="insight-item">' + esc(item) + '</div>';
                }).join('');
                loading.classList.add('hidden');
                list.classList.remove('hidden');
            } else {
                loading.innerHTML = '<span class="muted">No analysis available</span>';
            }
        } catch(e) {
            resolveLoading('insightsLoading', 'insightList', 'Failed to load analysis');
        }
    }

    /* ============================================================
       NEWS
       ============================================================ */
    async function loadNews() {
        try {
            var res = await fetch('/api/news/' + encodeURIComponent(currentSymbol));
            var data = await res.json();
            var list = document.getElementById('newsList');
            var loading = document.getElementById('newsLoading');
            if (!list || !loading) return;
            if (data.articles && data.articles.length > 0) {
                list.innerHTML = data.articles.map(function(a) {
                    var thumb = a.thumbnail ? '<img class="news-thumb" src="' + esc(a.thumbnail) + '" alt="">' : '';
                    return '<a class="news-item" href="' + esc(a.link) + '" target="_blank" rel="noopener">' +
                        thumb +
                        '<div class="news-info">' +
                        '<div class="news-title">' + esc(a.title) + '</div>' +
                        '<div class="news-meta">' + esc(a.publisher || '') + (a.publishedAt ? ' \u2022 ' + fmtDate(a.publishedAt) : '') + '</div>' +
                        '</div></a>';
                }).join('');
                loading.classList.add('hidden');
                list.classList.remove('hidden');
            } else {
                loading.innerHTML = '<span class="muted">No recent news</span>';
            }
        } catch(e) {
            resolveLoading('newsLoading', 'newsList', 'Failed to load news');
        }
    }

    /* ============================================================
       CHART
       ============================================================ */
    async function loadChart() {
        try {
            var res = await fetch('/api/history/' + encodeURIComponent(currentSymbol) + '?period=' + currentPeriod);
            var data = await res.json();
            if (data.error) return;
            var targets = quoteData ? {
                targetMean: quoteData.targetMeanPrice,
                targetHigh: quoteData.targetHighPrice,
                targetLow: quoteData.targetLowPrice
            } : null;
            if (typeof ChartRenderer !== 'undefined') {
                ChartRenderer.renderPriceChart('priceChart', data, currentPeriod, targets);
                ChartRenderer.renderVolumeChart('volumeChart', data, currentPeriod);
            }
        } catch(e) { /* chart stays empty */ }
    }

    /* ============================================================
       HELPERS
       ============================================================ */
    function showContent() {
        var ls = document.getElementById('loadingState');
        var sc = document.getElementById('stockContent');
        if (ls) ls.classList.add('hidden');
        if (sc) sc.classList.remove('hidden');
    }

    function showError(msg) {
        var ls = document.getElementById('loadingState');
        var es = document.getElementById('errorState');
        var em = document.getElementById('errorMessage');
        if (ls) ls.classList.add('hidden');
        if (em) em.textContent = msg;
        if (es) es.classList.remove('hidden');
    }

    function resolveLoading(loadingId, contentId, msg) {
        var el = document.getElementById(loadingId);
        if (el) el.innerHTML = '<span class="muted">' + esc(msg) + '</span>';
    }

    function setText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function detailRow(label, value) {
        return '<div class="rating-detail-item"><span class="label">' + label + '</span><span class="value">' + value + '</span></div>';
    }

    function techRow(label, value, signal) {
        var badge = signal ? ' <span class="signal-badge signal-' + signal + '">' + signal + '</span>' : '';
        return '<div class="tech-row"><span class="label">' + label + '</span><span class="value">' + value + badge + '</span></div>';
    }

    function trendSignal(t) { return t === 'uptrend' ? 'bullish' : t === 'downtrend' ? 'bearish' : 'neutral'; }
    function rsiSignal(rsi) { return rsi < 30 ? 'bullish' : rsi > 70 ? 'bearish' : 'neutral'; }
    function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '--'; }

    function fmtLarge(n) {
        if (n == null) return '--';
        var abs = Math.abs(n);
        if (abs >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
        if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
        if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
        if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return n.toLocaleString();
    }

    function fmt(n) {
        if (n == null || isNaN(n)) return '--';
        return Number(n).toFixed(2);
    }

    function fmtDate(dateStr) {
        try {
            var d = new Date(dateStr);
            var now = new Date();
            var diffH = Math.floor((now - d) / 3600000);
            if (diffH < 1) return 'Just now';
            if (diffH < 24) return diffH + 'h ago';
            var diffD = Math.floor(diffH / 24);
            if (diffD < 7) return diffD + 'd ago';
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch(e) { return dateStr; }
    }

    function esc(s) {
        if (!s) return '';
        var div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }
})();

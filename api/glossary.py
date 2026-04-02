"""
Educational glossary of stock market terms — Python port of Java Glossary.
"""

_TERMS = [
    {
        "name": "Market Cap",
        "definition": "Market capitalization is the total value of all a company's shares of stock. It is calculated by multiplying the stock price by the total number of outstanding shares.",
        "whyItMatters": "Market cap tells you the size of a company. Larger companies tend to be more stable but may grow slower. Smaller companies may grow faster but carry more risk.",
        "ranges": "Micro-cap: under $300M | Small-cap: $300M-$2B | Mid-cap: $2B-$10B | Large-cap: $10B-$200B | Mega-cap: over $200B",
        "category": "Valuation",
    },
    {
        "name": "P/E Ratio (Price-to-Earnings)",
        "definition": "The P/E ratio shows how much investors are paying for each dollar of a company's earnings. It is calculated by dividing the stock price by the earnings per share (EPS).",
        "whyItMatters": "A high P/E may mean investors expect high future growth or that the stock is overvalued. A low P/E may suggest the stock is undervalued or the company is facing challenges. It's best compared within the same industry.",
        "ranges": "Low: under 15 | Average: 15-25 | High: 25-50 | Very High: over 50. Growth companies often have higher P/E ratios than value companies.",
        "category": "Valuation",
    },
    {
        "name": "EPS (Earnings Per Share)",
        "definition": "Earnings per share is the portion of a company's profit that is allocated to each outstanding share of common stock. It is calculated by dividing net income by the number of outstanding shares.",
        "whyItMatters": "EPS tells you how profitable a company is on a per-share basis. Growing EPS over time is generally a positive sign. Negative EPS means the company is losing money.",
        "ranges": "Varies widely by industry. What matters most is the trend \u2014 is EPS growing, stable, or declining over time?",
        "category": "Profitability",
    },
    {
        "name": "Volume",
        "definition": "Volume is the total number of shares traded during a given time period, typically one day. It measures how actively a stock is being bought and sold.",
        "whyItMatters": "High volume often confirms the strength of a price move \u2014 if a stock rises on high volume, the move is more likely to be sustained. Low volume moves may reverse more easily.",
        "ranges": "Compare today's volume to the stock's average volume. Over 1.5x average is elevated. Over 2x average is significantly high.",
        "category": "Trading Activity",
    },
    {
        "name": "Average Volume",
        "definition": "Average volume is the typical number of shares traded per day, usually measured over the past 10 or 30 days.",
        "whyItMatters": "It gives you a baseline to compare against today's volume. If today's volume is much higher or lower than average, it may signal unusual activity or a significant event.",
        "ranges": "Used as a reference point. There is no universal good or bad level \u2014 it depends on the stock.",
        "category": "Trading Activity",
    },
    {
        "name": "52-Week High / Low",
        "definition": "The highest and lowest prices at which a stock has traded over the past 52 weeks (one year).",
        "whyItMatters": "These levels act as psychological benchmarks. A stock near its 52-week high may have strong momentum. A stock near its 52-week low may be undervalued or facing problems.",
        "ranges": "Near high: within 5-10% of 52-week high | Near low: within 5-10% of 52-week low | Middle: trading between 35-65% of the range",
        "category": "Price Range",
    },
    {
        "name": "Beta",
        "definition": "Beta measures how much a stock's price tends to move relative to the overall market (S&P 500). A beta of 1.0 means the stock moves roughly in line with the market.",
        "whyItMatters": "If you want a stock that moves more than the market (for potentially higher returns), look for a beta above 1. If you want stability, look for a beta below 1. A negative beta means the stock tends to move opposite to the market.",
        "ranges": "Low volatility: under 0.8 | Market-like: 0.8-1.2 | Above average: 1.2-1.5 | High volatility: over 1.5",
        "category": "Risk",
    },
    {
        "name": "Dividend Yield",
        "definition": "Dividend yield is the annual dividend payment divided by the stock price, expressed as a percentage. It tells you how much cash income you receive for each dollar invested.",
        "whyItMatters": "Dividend-paying stocks can provide regular income. A very high yield might be a warning sign that the dividend could be cut. Many growth companies pay no dividend at all, preferring to reinvest profits.",
        "ranges": "No dividend: 0% | Low: under 1.5% | Moderate: 1.5-3% | High: 3-5% | Very High (caution): over 5%",
        "category": "Income",
    },
    {
        "name": "Price-to-Book (P/B) Ratio",
        "definition": "The price-to-book ratio compares a stock's market value to its book value (assets minus liabilities). It is calculated by dividing the stock price by the book value per share.",
        "whyItMatters": "A P/B under 1 may indicate the stock is undervalued or the company has problems. Tech companies often have high P/B ratios because their value comes from intangible assets like software and brand, not physical assets.",
        "ranges": "Potentially undervalued: under 1.0 | Moderate: 1.0-3.0 | High: 3.0-10.0 | Very High: over 10.0 (common in tech)",
        "category": "Valuation",
    },
    {
        "name": "Debt-to-Equity Ratio",
        "definition": "The debt-to-equity ratio measures how much debt a company has compared to its shareholders' equity. A higher number means more debt relative to equity.",
        "whyItMatters": "Some debt can be healthy and help a company grow. Too much debt increases risk, especially during economic downturns. What's considered acceptable varies significantly by industry \u2014 utilities and banks naturally carry more debt.",
        "ranges": "Low: under 0.5 | Moderate: 0.5-1.0 | High: 1.0-2.0 | Very High: over 2.0 (varies by industry)",
        "category": "Financial Health",
    },
    {
        "name": "Return on Equity (ROE)",
        "definition": "Return on equity measures how efficiently a company generates profit from shareholders' equity. It is calculated by dividing net income by shareholders' equity.",
        "whyItMatters": "A higher ROE generally means the company is good at turning the money investors put in into profits. Consistently high ROE is often a sign of a strong business with competitive advantages.",
        "ranges": "Weak: under 5% | Average: 5-15% | Good: 15-25% | Excellent: over 25%",
        "category": "Profitability",
    },
    {
        "name": "Profit Margin",
        "definition": "Profit margin shows what percentage of revenue becomes actual profit after all expenses are paid. A profit margin of 20% means the company keeps $0.20 of every dollar in revenue as profit.",
        "whyItMatters": "Higher margins generally mean a more efficient or premium business. Comparing margins within the same industry is most useful, as margins vary widely across sectors.",
        "ranges": "Varies heavily by industry. Software: 20-40% is common | Retail: 2-5% is common | Manufacturing: 5-15% is common",
        "category": "Profitability",
    },
    {
        "name": "Open Price",
        "definition": "The price at which a stock first trades when the market opens for the day.",
        "whyItMatters": "Comparing the open price to the previous close tells you about overnight sentiment. A gap up (open above previous close) suggests positive overnight news. A gap down suggests negative news.",
        "ranges": "Compared to previous close. A gap of more than 1-2% is considered significant.",
        "category": "Price Data",
    },
    {
        "name": "Day High / Day Low",
        "definition": "The highest and lowest prices at which the stock has traded during the current trading day.",
        "whyItMatters": "The daily range shows how much price movement occurred during the day. A wide range may indicate volatile or eventful trading. Price near the day's high suggests buyers are in control; near the low suggests sellers.",
        "ranges": "Compare the range (high minus low) to the stock's average daily range to judge if today is unusually volatile.",
        "category": "Price Data",
    },
    {
        "name": "Previous Close",
        "definition": "The closing price of the stock on the most recent trading day.",
        "whyItMatters": "This is the baseline for calculating today's change. All daily price change numbers use this as the reference point.",
        "ranges": "Used as a reference point for daily change calculations.",
        "category": "Price Data",
    },
    {
        "name": "Moving Average (SMA/EMA)",
        "definition": "A moving average smooths out price data by creating a constantly updated average price over a specific time period (like 20 days or 50 days). SMA gives equal weight to all days; EMA gives more weight to recent days.",
        "whyItMatters": "Moving averages help identify trends. When the stock price is above its moving average, the trend is generally up. When below, the trend is generally down. Crossovers between moving averages can signal trend changes.",
        "ranges": "Common periods: 20-day (short-term), 50-day (medium-term), 200-day (long-term). Price above 200-day SMA is generally considered bullish.",
        "category": "Technical Analysis",
    },
    {
        "name": "RSI (Relative Strength Index)",
        "definition": "RSI is a momentum indicator that measures the speed and magnitude of recent price changes on a scale from 0 to 100.",
        "whyItMatters": "RSI helps identify whether a stock might be overbought (due for a pullback) or oversold (due for a bounce). It's not a guarantee but provides useful context about short-term momentum.",
        "ranges": "Oversold: under 30 | Neutral: 30-70 | Overbought: over 70. Extreme readings (under 20 or over 80) are stronger signals.",
        "category": "Technical Analysis",
    },
    {
        "name": "MACD (Moving Average Convergence Divergence)",
        "definition": "MACD tracks the relationship between two moving averages of a stock's price. It consists of the MACD line, signal line, and histogram.",
        "whyItMatters": "When the MACD line crosses above the signal line, it may indicate upward momentum. When it crosses below, it may indicate downward momentum. The histogram shows the strength of the signal.",
        "ranges": "Bullish: MACD line above signal line and rising | Bearish: MACD line below signal line and falling | The histogram shows whether momentum is strengthening or weakening.",
        "category": "Technical Analysis",
    },
    {
        "name": "Sector",
        "definition": "The broad category of the economy that a company belongs to, such as Technology, Healthcare, Finance, Energy, or Consumer Goods.",
        "whyItMatters": "Stocks within the same sector often move together. Understanding a company's sector helps you compare it to the right peers and understand what economic forces affect it most.",
        "ranges": "Major sectors include: Technology, Healthcare, Financials, Consumer Discretionary, Consumer Staples, Energy, Industrials, Materials, Utilities, Real Estate, Communication Services.",
        "category": "Company Info",
    },
]


def get_all_terms() -> list[dict]:
    return _TERMS


def get_term(name: str) -> dict | None:
    for t in _TERMS:
        if t["name"].lower() == name.lower():
            return t
    return None

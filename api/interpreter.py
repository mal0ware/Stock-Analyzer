"""
Plain-English stock interpretation — Python port of Java Interpreter.
Generates human-readable insights from quote data.
"""


def _fmt_large(num: float) -> str:
    if num >= 1_000_000_000_000:
        return f"${num / 1_000_000_000_000:.2f}T"
    if num >= 1_000_000_000:
        return f"${num / 1_000_000_000:.2f}B"
    if num >= 1_000_000:
        return f"${num / 1_000_000:.2f}M"
    return f"${num:.0f}"


_CAP_DESC = {
    "mega-cap": "Mega-cap companies are among the largest in the world, typically very stable with global brand recognition.",
    "large-cap": "Large-cap companies are well-established and generally considered lower-risk investments.",
    "mid-cap": "Mid-cap companies often offer a balance between growth potential and stability.",
    "small-cap": "Small-cap companies can offer higher growth potential but tend to carry more risk and volatility.",
    "micro-cap": "Micro-cap companies are very small and can be highly volatile. They often have limited analyst coverage.",
}


def generate_insights(data: dict) -> list[str]:
    insights = []

    price = data.get("price")
    change = data.get("change")
    change_pct = data.get("changePercent")
    high52 = data.get("fiftyTwoWeekHigh")
    low52 = data.get("fiftyTwoWeekLow")
    volume = data.get("volume")
    avg_volume = data.get("avgVolume")
    pe = data.get("peRatio")
    forward_pe = data.get("forwardPE")
    beta = data.get("beta")
    market_cap = data.get("marketCap")
    ptb = data.get("priceToBook")
    div_yield = data.get("dividendYield")

    # Price movement
    if change is not None and change_pct is not None:
        direction = "up" if change >= 0 else "down"
        abs_change = f"${abs(change):.2f}"
        abs_pct = f"{abs(change_pct):.2f}%"

        if abs(change_pct) < 0.5:
            insights.append(f"The stock is trading roughly flat today, {direction} just {abs_pct}. This suggests a quiet trading session with no major catalysts.")
        elif abs(change_pct) < 2.0:
            insights.append(f"The stock is {direction} {abs_pct} ({abs_change}) today, showing moderate movement.")
        elif abs(change_pct) < 5.0:
            insights.append(f"The stock has moved significantly today, {direction} {abs_pct} ({abs_change}). This is a notable move that may reflect new information or market sentiment.")
        else:
            insights.append(f"The stock is making a large move today, {direction} {abs_pct} ({abs_change}). Moves this size often indicate major news, earnings, or a significant shift in investor sentiment.")

    # 52-week range
    if price and high52 and low52 and high52 > low52:
        rng = high52 - low52
        position = (price - low52) / rng
        dist_high = ((high52 - price) / high52) * 100
        dist_low = ((price - low52) / low52) * 100

        if position > 0.9:
            insights.append(f"The stock is trading near its 52-week high (within {dist_high:.1f}%), meaning it's near the highest price of the past year. This could indicate strong momentum, but some investors see it as a sign the stock may be expensive.")
        elif position < 0.1:
            insights.append(f"The stock is trading near its 52-week low (within {dist_low:.1f}% above it). This could represent a buying opportunity if the company's fundamentals are sound, or it could signal ongoing challenges.")
        elif position > 0.65:
            insights.append("The stock is in the upper portion of its 52-week range, suggesting a generally positive trend over the past year.")
        elif position < 0.35:
            insights.append("The stock is in the lower portion of its 52-week range, which may indicate the stock has faced headwinds recently.")
        else:
            insights.append("The stock is trading near the middle of its 52-week range, suggesting balanced sentiment among investors.")

    # Volume
    if volume and avg_volume and avg_volume > 0:
        ratio = volume / avg_volume
        if ratio > 2.0:
            insights.append(f"Trading volume is significantly above average ({ratio:.1f}x normal). Heavy volume often means strong conviction behind today's price move — whether buyers or sellers are in control.")
        elif ratio > 1.3:
            insights.append("Trading volume is above average today, suggesting increased investor interest compared to a typical session.")
        elif ratio < 0.5:
            insights.append("Trading volume is well below average today, which may indicate low conviction or a wait-and-see attitude among investors.")
        elif ratio < 0.7:
            insights.append("Trading volume is below average today, suggesting a relatively quiet session for this stock.")
        else:
            insights.append("Trading volume is near its average level, indicating a typical day in terms of market participation.")

    # P/E Ratio
    if pe is not None:
        if pe < 0:
            insights.append("The P/E ratio is negative, meaning the company is currently not profitable. This is common for growth-stage companies that are investing heavily in expansion.")
        elif pe < 12:
            insights.append(f"The P/E ratio of {pe:.1f} is relatively low, which may suggest the stock is undervalued or that investors have modest expectations for future growth.")
        elif pe < 25:
            insights.append(f"The P/E ratio of {pe:.1f} is in a moderate range, suggesting a balance between the stock's current earnings and investor expectations.")
        elif pe < 50:
            insights.append(f"The P/E ratio of {pe:.1f} is relatively high. This often means investors expect strong future earnings growth to justify the premium price.")
        else:
            insights.append(f"The P/E ratio of {pe:.1f} is very high. This may indicate that investors have extremely high growth expectations, or that recent earnings were unusually low. High P/E stocks can be volatile.")

        if forward_pe and forward_pe > 0 and pe > 0:
            if forward_pe < pe * 0.8:
                insights.append(f"The forward P/E ({forward_pe:.1f}) is notably lower than the trailing P/E ({pe:.1f}), suggesting analysts expect earnings to grow significantly.")
            elif forward_pe > pe * 1.2:
                insights.append(f"The forward P/E ({forward_pe:.1f}) is higher than the trailing P/E ({pe:.1f}), which may suggest analysts expect earnings to decline.")

    # Beta
    if beta is not None:
        if beta < 0.5:
            insights.append(f"With a beta of {beta:.2f}, this stock is significantly less volatile than the overall market. It tends to move less during market swings, which can be appealing for conservative investors.")
        elif beta < 0.8:
            insights.append(f"The beta of {beta:.2f} indicates this stock is somewhat less volatile than the market average, making it a relatively stable holding.")
        elif beta <= 1.2:
            insights.append(f"The beta of {beta:.2f} means this stock moves roughly in line with the overall market.")
        elif beta <= 1.5:
            insights.append(f"With a beta of {beta:.2f}, this stock is more volatile than the market. It tends to amplify market movements — going up more on good days and down more on bad days.")
        else:
            insights.append(f"The beta of {beta:.2f} indicates high volatility compared to the market. This stock can see large swings and is generally considered higher-risk, higher-reward.")

    # Market cap
    if market_cap:
        if market_cap >= 200_000_000_000:
            cat = "mega-cap"
        elif market_cap >= 10_000_000_000:
            cat = "large-cap"
        elif market_cap >= 2_000_000_000:
            cat = "mid-cap"
        elif market_cap >= 300_000_000:
            cat = "small-cap"
        else:
            cat = "micro-cap"
        insights.append(f"This is a {cat} company with a market capitalization of {_fmt_large(market_cap)}. {_CAP_DESC.get(cat, '')}")

    # Dividend yield
    if div_yield and div_yield > 0:
        if div_yield > 4.0:
            insights.append(f"The dividend yield of {div_yield:.2f}% is above average, which may be attractive for income-focused investors. However, very high yields sometimes indicate the market expects the dividend to be cut.")
        elif div_yield > 1.5:
            insights.append(f"The stock pays a dividend yield of {div_yield:.2f}%, providing a moderate income stream to shareholders on top of any price appreciation.")
        else:
            insights.append(f"The stock has a modest dividend yield of {div_yield:.2f}%. The company returns some earnings to shareholders while likely reinvesting most profits for growth.")

    # Price to Book
    if ptb is not None:
        if ptb < 1.0:
            insights.append(f"The price-to-book ratio of {ptb:.2f} means the stock is trading below its book value, which some investors consider a sign of undervaluation.")
        elif ptb < 3.0:
            insights.append(f"The price-to-book ratio of {ptb:.2f} is in a moderate range.")
        elif ptb > 10.0:
            insights.append(f"The price-to-book ratio of {ptb:.2f} is quite high, typical of companies where value comes from intangible assets like brand, technology, or intellectual property rather than physical assets.")

    if not insights:
        insights.append("Limited data is available for detailed analysis of this stock at this time.")

    return insights

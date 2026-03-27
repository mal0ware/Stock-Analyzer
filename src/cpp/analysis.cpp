#include "analysis.h"
#include <cmath>
#include <algorithm>
#include <numeric>

namespace analysis {

std::vector<double> sma(const std::vector<double>& prices, int period) {
    std::vector<double> result;
    if ((int)prices.size() < period) return result;

    double sum = 0;
    for (int i = 0; i < period; i++) {
        sum += prices[i];
    }
    result.push_back(sum / period);

    for (int i = period; i < (int)prices.size(); i++) {
        sum += prices[i] - prices[i - period];
        result.push_back(sum / period);
    }

    return result;
}

std::vector<double> ema(const std::vector<double>& prices, int period) {
    std::vector<double> result;
    if ((int)prices.size() < period) return result;

    // Start with SMA for initial value
    double sum = 0;
    for (int i = 0; i < period; i++) {
        sum += prices[i];
    }
    double emaVal = sum / period;
    result.push_back(emaVal);

    double multiplier = 2.0 / (period + 1);

    for (int i = period; i < (int)prices.size(); i++) {
        emaVal = (prices[i] - emaVal) * multiplier + emaVal;
        result.push_back(emaVal);
    }

    return result;
}

std::vector<double> rsi(const std::vector<double>& prices, int period) {
    std::vector<double> result;
    if ((int)prices.size() < period + 1) return result;

    std::vector<double> gains, losses;
    for (int i = 1; i < (int)prices.size(); i++) {
        double change = prices[i] - prices[i - 1];
        gains.push_back(change > 0 ? change : 0);
        losses.push_back(change < 0 ? -change : 0);
    }

    // Initial average gain/loss
    double avgGain = 0, avgLoss = 0;
    for (int i = 0; i < period; i++) {
        avgGain += gains[i];
        avgLoss += losses[i];
    }
    avgGain /= period;
    avgLoss /= period;

    if (avgLoss == 0) {
        result.push_back(100.0);
    } else {
        double rs = avgGain / avgLoss;
        result.push_back(100.0 - (100.0 / (1.0 + rs)));
    }

    // Subsequent values using smoothed averages
    for (int i = period; i < (int)gains.size(); i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

        if (avgLoss == 0) {
            result.push_back(100.0);
        } else {
            double rs = avgGain / avgLoss;
            result.push_back(100.0 - (100.0 / (1.0 + rs)));
        }
    }

    return result;
}

json macd(const std::vector<double>& prices, int fast, int slow, int signalPeriod) {
    json result;

    auto fastEma = ema(prices, fast);
    auto slowEma = ema(prices, slow);

    if (fastEma.empty() || slowEma.empty()) {
        result["macd"] = json::array();
        result["signal"] = json::array();
        result["histogram"] = json::array();
        return result;
    }

    // Align arrays - slowEma starts later
    int offset = slow - fast;
    std::vector<double> macdLine;
    for (int i = 0; i < (int)slowEma.size(); i++) {
        macdLine.push_back(fastEma[i + offset] - slowEma[i]);
    }

    auto signalLine = ema(macdLine, signalPeriod);

    result["macd"] = json::array();
    result["signal"] = json::array();
    result["histogram"] = json::array();

    int sigOffset = (int)macdLine.size() - (int)signalLine.size();

    for (int i = 0; i < (int)signalLine.size(); i++) {
        double m = macdLine[i + sigOffset];
        double s = signalLine[i];
        result["macd"].push_back(std::round(m * 100) / 100);
        result["signal"].push_back(std::round(s * 100) / 100);
        result["histogram"].push_back(std::round((m - s) * 100) / 100);
    }

    return result;
}

double volatility(const std::vector<double>& prices, int period) {
    if ((int)prices.size() < 2) return 0.0;

    int n = std::min(period, (int)prices.size() - 1);
    std::vector<double> returns;

    int start = (int)prices.size() - n - 1;
    if (start < 0) start = 0;

    for (int i = start + 1; i < (int)prices.size(); i++) {
        if (prices[i - 1] != 0) {
            returns.push_back((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
    }

    if (returns.empty()) return 0.0;

    double mean = std::accumulate(returns.begin(), returns.end(), 0.0) / returns.size();
    double sqSum = 0;
    for (double r : returns) {
        sqSum += (r - mean) * (r - mean);
    }

    return std::sqrt(sqSum / returns.size()) * 100.0; // As percentage
}

std::string detectTrend(const std::vector<double>& prices) {
    if (prices.size() < 5) return "insufficient_data";

    int n = prices.size();

    // Use linear regression slope
    double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (int i = 0; i < n; i++) {
        sumX += i;
        sumY += prices[i];
        sumXY += i * prices[i];
        sumX2 += i * i;
    }

    double slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    double avgPrice = sumY / n;

    // Normalize slope as percentage of average price
    double normalizedSlope = (slope / avgPrice) * 100.0 * n;

    if (normalizedSlope > 3.0) return "uptrend";
    if (normalizedSlope < -3.0) return "downtrend";
    return "sideways";
}

json supportResistance(const std::vector<double>& highs, const std::vector<double>& lows, const std::vector<double>& closes) {
    json result;

    if (closes.empty()) {
        result["support"] = nullptr;
        result["resistance"] = nullptr;
        return result;
    }

    int n = closes.size();
    int lookback = std::min(20, n);

    double minLow = *std::min_element(lows.end() - lookback, lows.end());
    double maxHigh = *std::max_element(highs.end() - lookback, highs.end());

    result["support"] = std::round(minLow * 100) / 100;
    result["resistance"] = std::round(maxHigh * 100) / 100;

    return result;
}

json computeAll(const json& historyData) {
    json result;

    if (!historyData.contains("closes") || historyData["closes"].empty()) {
        result["error"] = "No price data available for analysis";
        return result;
    }

    std::vector<double> closes;
    std::vector<double> highs;
    std::vector<double> lows;
    std::vector<double> volumes;

    for (auto& v : historyData["closes"]) {
        closes.push_back(v.is_null() ? 0.0 : v.get<double>());
    }
    if (historyData.contains("highs")) {
        for (auto& v : historyData["highs"]) {
            highs.push_back(v.is_null() ? 0.0 : v.get<double>());
        }
    }
    if (historyData.contains("lows")) {
        for (auto& v : historyData["lows"]) {
            lows.push_back(v.is_null() ? 0.0 : v.get<double>());
        }
    }
    if (historyData.contains("volumes")) {
        for (auto& v : historyData["volumes"]) {
            volumes.push_back(v.is_null() ? 0.0 : v.get<double>());
        }
    }

    // SMA
    auto sma20 = sma(closes, 20);
    auto sma50 = sma(closes, 50);
    auto sma200 = sma(closes, 200);

    result["sma20"] = sma20;
    result["sma50"] = sma50;
    result["sma200"] = sma200;

    // EMA
    auto ema12 = ema(closes, 12);
    auto ema26 = ema(closes, 26);
    result["ema12"] = ema12;
    result["ema26"] = ema26;

    // RSI
    auto rsiValues = rsi(closes, 14);
    result["rsi"] = rsiValues;
    result["currentRsi"] = rsiValues.empty() ? nullptr : json(std::round(rsiValues.back() * 100) / 100);

    // MACD
    result["macd"] = macd(closes);

    // Volatility
    result["volatility"] = std::round(volatility(closes) * 100) / 100;

    // Trend
    result["trend"] = detectTrend(closes);

    // Support/Resistance
    if (!highs.empty() && !lows.empty()) {
        result["supportResistance"] = supportResistance(highs, lows, closes);
    }

    // Price change over period
    if (closes.size() >= 2) {
        double first = closes.front();
        double last = closes.back();
        if (first != 0) {
            result["periodReturn"] = std::round(((last - first) / first) * 10000) / 100;
        }
    }

    return result;
}

} // namespace analysis

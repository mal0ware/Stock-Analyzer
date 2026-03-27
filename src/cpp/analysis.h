#pragma once
#include <vector>
#include <string>
#include "json.hpp"

namespace analysis {

using json = nlohmann::json;

// Simple Moving Average
std::vector<double> sma(const std::vector<double>& prices, int period);

// Exponential Moving Average
std::vector<double> ema(const std::vector<double>& prices, int period);

// Relative Strength Index
std::vector<double> rsi(const std::vector<double>& prices, int period = 14);

// MACD (returns object with macd, signal, histogram arrays)
json macd(const std::vector<double>& prices, int fast = 12, int slow = 26, int signal = 9);

// Volatility (standard deviation of returns)
double volatility(const std::vector<double>& prices, int period = 20);

// Trend detection: "uptrend", "downtrend", or "sideways"
std::string detectTrend(const std::vector<double>& prices);

// Support and resistance levels
json supportResistance(const std::vector<double>& highs, const std::vector<double>& lows, const std::vector<double>& closes);

// Compute all technical indicators for a dataset
json computeAll(const json& historyData);

} // namespace analysis

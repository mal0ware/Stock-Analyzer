#include "server.h"
#include "httplib.h"
#include "json.hpp"
#include "analysis.h"
#include "subprocess.h"
#include "cache.h"
#include <iostream>
#include <filesystem>
#include <regex>
#include <unordered_map>
#include <chrono>
#include <mutex>

using json = nlohmann::json;

namespace server {

static httplib::Server svr;
static int serverPort = 8089;

// ================================================================
// Rate Limiter — per-IP request throttling (OWASP A04:2021)
// Limits each IP to a fixed number of requests per time window.
// Returns HTTP 429 with Retry-After header when exceeded.
// ================================================================
class RateLimiter {
public:
    bool allow(const std::string& ip, int maxRequests = 60, int windowSeconds = 60) {
        std::lock_guard<std::mutex> lock(mtx);
        auto now = std::chrono::steady_clock::now();
        auto& bucket = buckets[ip];

        auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - bucket.windowStart).count();
        if (elapsed >= windowSeconds) {
            bucket.count = 0;
            bucket.windowStart = now;
        }

        bucket.count++;
        return bucket.count <= maxRequests;
    }

    void cleanup(int maxAgeSeconds = 300) {
        std::lock_guard<std::mutex> lock(mtx);
        auto now = std::chrono::steady_clock::now();
        for (auto it = buckets.begin(); it != buckets.end(); ) {
            auto age = std::chrono::duration_cast<std::chrono::seconds>(now - it->second.windowStart).count();
            if (age > maxAgeSeconds) {
                it = buckets.erase(it);
            } else {
                ++it;
            }
        }
    }

private:
    struct Bucket {
        int count = 0;
        std::chrono::steady_clock::time_point windowStart = std::chrono::steady_clock::now();
    };
    std::unordered_map<std::string, Bucket> buckets;
    std::mutex mtx;
};

static RateLimiter rateLimiter;

// ================================================================
// Input Validation — strict whitelisting (OWASP A03:2021)
// All user-supplied parameters are validated before use.
// ================================================================

// Ticker symbols: 1-10 uppercase alphanumeric chars, dots, hyphens
// Covers standard formats: AAPL, BRK.B, BF-B, 0700.HK
static bool isValidSymbol(const std::string& s) {
    if (s.empty() || s.size() > 10) return false;
    for (char c : s) {
        if (!std::isalnum(static_cast<unsigned char>(c)) && c != '.' && c != '-') {
            return false;
        }
    }
    return true;
}

// Period parameter: strict whitelist of allowed values only
static bool isValidPeriod(const std::string& s) {
    return s == "1d" || s == "5d" || s == "1mo" ||
           s == "6mo" || s == "1y" || s == "5y";
}

// Search query: safe printable chars only, max 100 characters
static bool isValidQuery(const std::string& s) {
    if (s.empty() || s.size() > 100) return false;
    for (char c : s) {
        if (!std::isalnum(static_cast<unsigned char>(c)) &&
            c != ' ' && c != '.' && c != '-' && c != '&' && c != '\'') {
            return false;
        }
    }
    return true;
}

// ================================================================
// Response helpers
// ================================================================

// Return a JSON error response with the given HTTP status code.
static void sendError(httplib::Response& res, int status, const std::string& message) {
    json err;
    err["error"] = message;
    res.status = status;
    res.set_content(err.dump(), "application/json");
}

// Validate subprocess output is valid JSON, send it as the response.
// If the JSON contains an "error" key, forward it as a 404.
// Logs raw output to stderr on failure for debugging.
// Returns true if response was sent successfully, false on error.
static bool sendJsonResult(httplib::Response& res, const std::string& result, const std::string& context) {
    if (result.empty()) {
        std::cerr << "[" << context << "] subprocess returned empty output" << std::endl;
        sendError(res, 502, "No response from backend for " + context + ". Check server logs for details.");
        return false;
    }

    // Parse the JSON to validate it and check for error payloads
    try {
        auto parsed = json::parse(result);

        // If the Python script returned {"error": "..."}, forward it as a 404
        if (parsed.contains("error") && !parsed.contains("results") && !parsed.contains("articles")) {
            std::string errMsg = parsed["error"].get<std::string>();
            std::cerr << "[" << context << "] backend error: " << errMsg << std::endl;
            sendError(res, 404, errMsg);
            return false;
        }

        res.set_content(result, "application/json");
        return true;
    } catch (const json::parse_error& e) {
        std::cerr << "[" << context << "] invalid JSON from subprocess: " << e.what()
                  << "\nRaw output (first 500 chars): " << result.substr(0, 500) << std::endl;
        sendError(res, 502, "Backend returned invalid data for " + context + ". Check server logs.");
        return false;
    }
}

static void setupRoutes() {
    std::string basePath = subprocess::getBasePath();
    std::string frontendPath = basePath + "/frontend";

    // Fallback to source directory if running from different location
    if (!std::filesystem::exists(frontendPath)) {
        frontendPath = basePath + "/../src/frontend";
    }

    // Serve static frontend files
    svr.set_mount_point("/", frontendPath);

    // ============================================================
    // Security headers (OWASP A05:2021)
    // Applied to every response from the server.
    // ============================================================
    svr.set_post_routing_handler([](const httplib::Request& req, httplib::Response& res) {
        std::string origin = req.get_header_value("Origin");
        if (origin == "http://localhost:8089" || origin == "http://127.0.0.1:8089") {
            res.set_header("Access-Control-Allow-Origin", origin);
        } else {
            res.set_header("Access-Control-Allow-Origin", "http://localhost:8089");
        }
        res.set_header("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type");
        res.set_header("X-Content-Type-Options", "nosniff");
        res.set_header("X-Frame-Options", "DENY");
        res.set_header("X-XSS-Protection", "1; mode=block");
        res.set_header("Referrer-Policy", "strict-origin-when-cross-origin");
        res.set_header("Content-Security-Policy",
            "default-src 'self'; "
            "script-src 'self' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' https: data:; "
            "connect-src 'self' http://localhost:8089 http://127.0.0.1:8089; "
            "font-src 'self'; "
            "frame-ancestors 'none';"
        );
    });

    // ============================================================
    // Rate limiting — 60 requests/minute per IP
    // ============================================================
    svr.set_pre_routing_handler([](const httplib::Request& req, httplib::Response& res) -> httplib::Server::HandlerResponse {
        if (req.path.rfind("/api/", 0) == 0) {
            if (!rateLimiter.allow(req.remote_addr)) {
                res.status = 429;
                res.set_header("Retry-After", "60");
                res.set_content(
                    "{\"error\":\"Too many requests. Please wait 60 seconds before trying again.\"}",
                    "application/json"
                );
                return httplib::Server::HandlerResponse::Handled;
            }
        }
        return httplib::Server::HandlerResponse::Unhandled;
    });

    // ============================================================
    // Health check
    // ============================================================
    svr.Get("/api/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("{\"status\":\"ok\"}", "application/json");
    });

    // ============================================================
    // Diagnostics — checks Python, yfinance, Java, and script paths
    // ============================================================
    svr.Get("/api/diagnostics", [](const httplib::Request&, httplib::Response& res) {
        json diag;
        std::string base = subprocess::getBasePath();
        diag["basePath"] = base;

        // Check script paths
        std::string scriptPath1 = base + "/python/data_fetcher.py";
        std::string scriptPath2 = base + "/../src/python/data_fetcher.py";
        diag["scriptPath"] = std::filesystem::exists(scriptPath1) ? scriptPath1 : scriptPath2;
        diag["scriptExists"] = std::filesystem::exists(scriptPath1) || std::filesystem::exists(scriptPath2);

        // Check Python + yfinance
        std::string pyCheck = subprocess::runPython("data_fetcher.py", {"--version-check"});
        diag["pythonCheck"] = pyCheck.substr(0, 300);

        // Check which python3 is being used
        std::string whichPy = subprocess::run("python3", {"--version"});
        diag["pythonVersion"] = whichPy.substr(0, 100);

        // Check Java
        std::string classPath = base + "/java";
        diag["javaClassPath"] = classPath;
        diag["javaClassExists"] = std::filesystem::exists(classPath + "/analyzer/Interpreter.class");

        res.set_content(diag.dump(2), "application/json");
    });

    // ============================================================
    // Search for tickers
    // ============================================================
    svr.Get("/api/search", [](const httplib::Request& req, httplib::Response& res) {
        auto query = req.get_param_value("q");
        if (query.empty()) {
            res.set_content("{\"results\":[]}", "application/json");
            return;
        }

        if (!isValidQuery(query)) {
            sendError(res, 400, "Invalid search query. Use only letters, numbers, spaces, dots, and hyphens.");
            return;
        }

        std::string cacheKey = "search:" + query;
        std::string cached = Cache::instance().get(cacheKey);
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        std::string result = subprocess::runPython("data_fetcher.py", {"search", query});

        // For search, always return results array even on error
        try {
            auto parsed = json::parse(result);
            if (parsed.contains("results")) {
                Cache::instance().set(cacheKey, result, 300);
                res.set_content(result, "application/json");
            } else {
                std::cerr << "[search] unexpected response format: " << result.substr(0, 200) << std::endl;
                res.set_content("{\"results\":[]}", "application/json");
            }
        } catch (const json::parse_error& e) {
            std::cerr << "[search] invalid JSON: " << e.what()
                      << "\nRaw: " << result.substr(0, 300) << std::endl;
            res.set_content("{\"results\":[]}", "application/json");
        }
    });

    // ============================================================
    // Get stock quote
    // ============================================================
    svr.Get("/api/quote/:symbol", [](const httplib::Request& req, httplib::Response& res) {
        auto symbol = req.path_params.at("symbol");

        if (!isValidSymbol(symbol)) {
            sendError(res, 400, "Invalid ticker symbol '" + symbol + "'. Use 1-10 alphanumeric characters, dots, or hyphens.");
            return;
        }

        std::string cacheKey = "quote:" + symbol;
        std::string cached = Cache::instance().get(cacheKey);
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        std::string result = subprocess::runPython("data_fetcher.py", {"quote", symbol});
        if (sendJsonResult(res, result, "quote:" + symbol)) {
            Cache::instance().set(cacheKey, result, 30);
        }
    });

    // ============================================================
    // Get stock history
    // ============================================================
    svr.Get("/api/history/:symbol", [](const httplib::Request& req, httplib::Response& res) {
        auto symbol = req.path_params.at("symbol");
        auto period = req.get_param_value("period");
        if (period.empty()) period = "1mo";

        if (!isValidSymbol(symbol)) {
            sendError(res, 400, "Invalid ticker symbol '" + symbol + "'.");
            return;
        }
        if (!isValidPeriod(period)) {
            sendError(res, 400, "Invalid period '" + period + "'. Allowed values: 1d, 5d, 1mo, 6mo, 1y, 5y");
            return;
        }

        std::string cacheKey = "history:" + symbol + ":" + period;
        std::string cached = Cache::instance().get(cacheKey);
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        std::string result = subprocess::runPython("data_fetcher.py", {"history", symbol, period});
        if (sendJsonResult(res, result, "history:" + symbol + ":" + period)) {
            int ttl = (period == "1d" || period == "5d") ? 60 : 300;
            Cache::instance().set(cacheKey, result, ttl);
        }
    });

    // ============================================================
    // Get technical analysis
    // ============================================================
    svr.Get("/api/analysis/:symbol", [](const httplib::Request& req, httplib::Response& res) {
        auto symbol = req.path_params.at("symbol");
        auto period = req.get_param_value("period");
        if (period.empty()) period = "1y";

        if (!isValidSymbol(symbol)) {
            sendError(res, 400, "Invalid ticker symbol '" + symbol + "'.");
            return;
        }
        if (!isValidPeriod(period)) {
            sendError(res, 400, "Invalid period '" + period + "'. Allowed values: 1d, 5d, 1mo, 6mo, 1y, 5y");
            return;
        }

        std::string cacheKey = "analysis:" + symbol + ":" + period;
        std::string cached = Cache::instance().get(cacheKey);
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        std::string historyStr = subprocess::runPython("data_fetcher.py", {"history", symbol, period});

        try {
            json historyData = json::parse(historyStr);
            if (historyData.contains("error")) {
                std::string errMsg = historyData["error"].get<std::string>();
                std::cerr << "[analysis:" << symbol << "] history fetch failed: " << errMsg << std::endl;
                sendError(res, 404, "Cannot analyze " + symbol + ": " + errMsg);
                return;
            }

            json analysisResult = analysis::computeAll(historyData);
            std::string result = analysisResult.dump();

            Cache::instance().set(cacheKey, result, 120);
            res.set_content(result, "application/json");
        } catch (const json::parse_error& e) {
            std::cerr << "[analysis:" << symbol << "] JSON parse error: " << e.what()
                      << "\nRaw: " << historyStr.substr(0, 300) << std::endl;
            sendError(res, 502, "Failed to parse history data for analysis of " + symbol);
        } catch (const std::exception& e) {
            std::cerr << "[analysis:" << symbol << "] exception: " << e.what() << std::endl;
            sendError(res, 500, "Analysis failed for " + symbol + ": " + std::string(e.what()));
        }
    });

    // ============================================================
    // Get plain-English interpretation (Java)
    // ============================================================
    svr.Get("/api/interpret/:symbol", [](const httplib::Request& req, httplib::Response& res) {
        auto symbol = req.path_params.at("symbol");

        if (!isValidSymbol(symbol)) {
            sendError(res, 400, "Invalid ticker symbol '" + symbol + "'.");
            return;
        }

        std::string cacheKey = "interpret:" + symbol;
        std::string cached = Cache::instance().get(cacheKey);
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        // Fetch the quote data first — validate before passing to Java
        std::string quoteStr = subprocess::runPython("data_fetcher.py", {"quote", symbol});
        try {
            auto quoteJson = json::parse(quoteStr);
            if (quoteJson.contains("error") && !quoteJson.contains("price")) {
                std::string errMsg = quoteJson["error"].get<std::string>();
                std::cerr << "[interpret:" << symbol << "] quote fetch failed: " << errMsg << std::endl;
                sendError(res, 404, "Cannot interpret " + symbol + ": " + errMsg);
                return;
            }
        } catch (const json::parse_error& e) {
            std::cerr << "[interpret:" << symbol << "] quote JSON parse error: " << e.what() << std::endl;
            sendError(res, 502, "Failed to fetch quote data for interpretation of " + symbol);
            return;
        }

        std::string result = subprocess::runJava("analyzer.Interpreter", {}, quoteStr);

        if (!result.empty()) {
            // Validate the Java output is proper JSON before caching
            try {
                auto parsed = json::parse(result);
                (void)parsed; // validate only
                Cache::instance().set(cacheKey, result, 60);
                res.set_content(result, "application/json");
            } catch (const json::parse_error& e) {
                std::cerr << "[interpret:" << symbol << "] Java returned invalid JSON: " << e.what()
                          << "\nRaw: " << result.substr(0, 300) << std::endl;
                res.set_content("{\"insights\":[\"Interpretation temporarily unavailable.\"]}", "application/json");
            }
        } else {
            std::cerr << "[interpret:" << symbol << "] Java returned empty output" << std::endl;
            res.set_content("{\"insights\":[\"Interpretation unavailable — Java backend returned no data.\"]}", "application/json");
        }
    });

    // ============================================================
    // Get news
    // ============================================================
    svr.Get("/api/news/:symbol", [](const httplib::Request& req, httplib::Response& res) {
        auto symbol = req.path_params.at("symbol");

        if (!isValidSymbol(symbol)) {
            sendError(res, 400, "Invalid ticker symbol '" + symbol + "'.");
            return;
        }

        std::string cacheKey = "news:" + symbol;
        std::string cached = Cache::instance().get(cacheKey);
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        std::string result = subprocess::runPython("news_fetcher.py", {symbol});

        // For news, always return a valid articles array
        try {
            auto parsed = json::parse(result);
            if (parsed.contains("articles")) {
                Cache::instance().set(cacheKey, result, 300);
                res.set_content(result, "application/json");
            } else {
                std::cerr << "[news:" << symbol << "] unexpected format: " << result.substr(0, 200) << std::endl;
                res.set_content("{\"articles\":[]}", "application/json");
            }
        } catch (const json::parse_error& e) {
            std::cerr << "[news:" << symbol << "] invalid JSON: " << e.what()
                      << "\nRaw: " << result.substr(0, 300) << std::endl;
            res.set_content("{\"articles\":[]}", "application/json");
        }
    });

    // ============================================================
    // Get glossary (Java)
    // ============================================================
    svr.Get("/api/glossary", [](const httplib::Request&, httplib::Response& res) {
        std::string cached = Cache::instance().get("glossary");
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        std::string result = subprocess::runJava("analyzer.Glossary", {"all"});

        if (!result.empty()) {
            try {
                auto parsed = json::parse(result);
                (void)parsed; // validate only
                Cache::instance().set("glossary", result, 3600);
                res.set_content(result, "application/json");
            } catch (const json::parse_error& e) {
                std::cerr << "[glossary] Java returned invalid JSON: " << e.what() << std::endl;
                res.set_content("{\"terms\":[]}", "application/json");
            }
        } else {
            std::cerr << "[glossary] Java returned empty output" << std::endl;
            res.set_content("{\"terms\":[]}", "application/json");
        }
    });
}

void start(int port) {
    serverPort = port;
    setupRoutes();
    std::cout << "Stock Analyzer server starting on http://localhost:" << port << std::endl;
    svr.listen("127.0.0.1", port);
}

void stop() {
    svr.stop();
}

int getPort() {
    return serverPort;
}

} // namespace server

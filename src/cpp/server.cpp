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
    // Returns true if the request is allowed, false if rate-limited.
    bool allow(const std::string& ip, int maxRequests = 60, int windowSeconds = 60) {
        std::lock_guard<std::mutex> lock(mtx);
        auto now = std::chrono::steady_clock::now();
        auto& bucket = buckets[ip];

        // Reset bucket if window has expired
        auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - bucket.windowStart).count();
        if (elapsed >= windowSeconds) {
            bucket.count = 0;
            bucket.windowStart = now;
        }

        bucket.count++;
        return bucket.count <= maxRequests;
    }

    // Periodic cleanup of stale entries to prevent unbounded memory growth
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

// Return a JSON error response with the given HTTP status code
static void sendError(httplib::Response& res, int status, const std::string& message) {
    json err;
    err["error"] = message;
    res.status = status;
    res.set_content(err.dump(), "application/json");
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
        // CORS — allow both localhost and 127.0.0.1 since this is a local-only app.
        // Electron uses 127.0.0.1, WSL Edge uses localhost — both must work.
        std::string origin = req.get_header_value("Origin");
        if (origin == "http://localhost:8089" || origin == "http://127.0.0.1:8089") {
            res.set_header("Access-Control-Allow-Origin", origin);
        } else {
            // For same-origin requests (no Origin header), allow localhost
            res.set_header("Access-Control-Allow-Origin", "http://localhost:8089");
        }
        res.set_header("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type");

        // Prevent MIME-type sniffing attacks
        res.set_header("X-Content-Type-Options", "nosniff");

        // Prevent clickjacking via iframes
        res.set_header("X-Frame-Options", "DENY");

        // XSS protection for legacy browsers
        res.set_header("X-XSS-Protection", "1; mode=block");

        // Don't leak referrer URLs to external sites
        res.set_header("Referrer-Policy", "strict-origin-when-cross-origin");

        // Content Security Policy — whitelist trusted sources only.
        // Allow connections to both localhost and 127.0.0.1 for cross-platform compat.
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
    // Returns HTTP 429 with Retry-After header when exceeded.
    // ============================================================
    svr.set_pre_routing_handler([](const httplib::Request& req, httplib::Response& res) -> httplib::Server::HandlerResponse {
        // Only rate-limit API endpoints, not static files
        if (req.path.rfind("/api/", 0) == 0) {
            if (!rateLimiter.allow(req.remote_addr)) {
                res.status = 429;
                res.set_header("Retry-After", "60");
                res.set_content(
                    "{\"error\":\"Too many requests. Please wait before trying again.\"}",
                    "application/json"
                );
                return httplib::Server::HandlerResponse::Handled;
            }
        }
        return httplib::Server::HandlerResponse::Unhandled;
    });

    // Health check
    svr.Get("/api/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("{\"status\":\"ok\"}", "application/json");
    });

    // Search for tickers
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
        Cache::instance().set(cacheKey, result, 300);
        res.set_content(result, "application/json");
    });

    // Get stock quote
    svr.Get("/api/quote/:symbol", [](const httplib::Request& req, httplib::Response& res) {
        auto symbol = req.path_params.at("symbol");

        if (!isValidSymbol(symbol)) {
            sendError(res, 400, "Invalid ticker symbol. Use 1-10 alphanumeric characters.");
            return;
        }

        std::string cacheKey = "quote:" + symbol;
        std::string cached = Cache::instance().get(cacheKey);
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        std::string result = subprocess::runPython("data_fetcher.py", {"quote", symbol});
        Cache::instance().set(cacheKey, result, 30);
        res.set_content(result, "application/json");
    });

    // Get stock history
    svr.Get("/api/history/:symbol", [](const httplib::Request& req, httplib::Response& res) {
        auto symbol = req.path_params.at("symbol");
        auto period = req.get_param_value("period");
        if (period.empty()) period = "1mo";

        if (!isValidSymbol(symbol)) {
            sendError(res, 400, "Invalid ticker symbol.");
            return;
        }
        if (!isValidPeriod(period)) {
            sendError(res, 400, "Invalid period. Allowed values: 1d, 5d, 1mo, 6mo, 1y, 5y");
            return;
        }

        std::string cacheKey = "history:" + symbol + ":" + period;
        std::string cached = Cache::instance().get(cacheKey);
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        std::string result = subprocess::runPython("data_fetcher.py", {"history", symbol, period});
        int ttl = (period == "1d" || period == "5d") ? 60 : 300;
        Cache::instance().set(cacheKey, result, ttl);
        res.set_content(result, "application/json");
    });

    // Get technical analysis
    svr.Get("/api/analysis/:symbol", [](const httplib::Request& req, httplib::Response& res) {
        auto symbol = req.path_params.at("symbol");
        auto period = req.get_param_value("period");
        if (period.empty()) period = "1y";

        if (!isValidSymbol(symbol)) {
            sendError(res, 400, "Invalid ticker symbol.");
            return;
        }
        if (!isValidPeriod(period)) {
            sendError(res, 400, "Invalid period. Allowed values: 1d, 5d, 1mo, 6mo, 1y, 5y");
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
                res.set_content(historyStr, "application/json");
                return;
            }

            json analysisResult = analysis::computeAll(historyData);
            std::string result = analysisResult.dump();

            Cache::instance().set(cacheKey, result, 120);
            res.set_content(result, "application/json");
        } catch (const std::exception&) {
            sendError(res, 500, "Analysis failed");
        }
    });

    // Get plain-English interpretation (Java)
    svr.Get("/api/interpret/:symbol", [](const httplib::Request& req, httplib::Response& res) {
        auto symbol = req.path_params.at("symbol");

        if (!isValidSymbol(symbol)) {
            sendError(res, 400, "Invalid ticker symbol.");
            return;
        }

        std::string cacheKey = "interpret:" + symbol;
        std::string cached = Cache::instance().get(cacheKey);
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        std::string quoteStr = subprocess::runPython("data_fetcher.py", {"quote", symbol});
        std::string result = subprocess::runJava("analyzer.Interpreter", {}, quoteStr);

        if (!result.empty()) {
            Cache::instance().set(cacheKey, result, 60);
            res.set_content(result, "application/json");
        } else {
            res.set_content("{\"insights\":[\"Interpretation unavailable.\"]}", "application/json");
        }
    });

    // Get news
    svr.Get("/api/news/:symbol", [](const httplib::Request& req, httplib::Response& res) {
        auto symbol = req.path_params.at("symbol");

        if (!isValidSymbol(symbol)) {
            sendError(res, 400, "Invalid ticker symbol.");
            return;
        }

        std::string cacheKey = "news:" + symbol;
        std::string cached = Cache::instance().get(cacheKey);
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        std::string result = subprocess::runPython("news_fetcher.py", {symbol});
        Cache::instance().set(cacheKey, result, 300);
        res.set_content(result, "application/json");
    });

    // Get glossary (Java)
    svr.Get("/api/glossary", [](const httplib::Request&, httplib::Response& res) {
        std::string cached = Cache::instance().get("glossary");
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        std::string result = subprocess::runJava("analyzer.Glossary", {"all"});

        if (!result.empty()) {
            Cache::instance().set("glossary", result, 3600);
            res.set_content(result, "application/json");
        } else {
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

#include "server.h"
#include "httplib.h"
#include "json.hpp"
#include "analysis.h"
#include "subprocess.h"
#include "cache.h"
#include <iostream>
#include <filesystem>

using json = nlohmann::json;

namespace server {

static httplib::Server svr;
static int serverPort = 8089;

static void setupRoutes() {
    std::string basePath = subprocess::getBasePath();
    std::string frontendPath = basePath + "/frontend";

    // Fallback to source directory if running from different location
    if (!std::filesystem::exists(frontendPath)) {
        frontendPath = basePath + "/../src/frontend";
    }

    // Serve static frontend files
    svr.set_mount_point("/", frontendPath);

    // CORS headers for all API responses
    svr.set_post_routing_handler([](const httplib::Request&, httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin", "*");
        res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type");
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

        // Check cache
        std::string cacheKey = "search:" + query;
        std::string cached = Cache::instance().get(cacheKey);
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        std::string result = subprocess::runPython("data_fetcher.py", "search \"" + query + "\"");
        Cache::instance().set(cacheKey, result, 300); // Cache 5 min
        res.set_content(result, "application/json");
    });

    // Get stock quote
    svr.Get("/api/quote/:symbol", [](const httplib::Request& req, httplib::Response& res) {
        auto symbol = req.path_params.at("symbol");

        std::string cacheKey = "quote:" + symbol;
        std::string cached = Cache::instance().get(cacheKey);
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        std::string result = subprocess::runPython("data_fetcher.py", "quote " + symbol);
        Cache::instance().set(cacheKey, result, 30); // Cache 30 sec
        res.set_content(result, "application/json");
    });

    // Get stock history
    svr.Get("/api/history/:symbol", [](const httplib::Request& req, httplib::Response& res) {
        auto symbol = req.path_params.at("symbol");
        auto period = req.get_param_value("period");
        if (period.empty()) period = "1mo";

        std::string cacheKey = "history:" + symbol + ":" + period;
        std::string cached = Cache::instance().get(cacheKey);
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        std::string result = subprocess::runPython("data_fetcher.py", "history " + symbol + " " + period);
        int ttl = (period == "1d" || period == "5d") ? 60 : 300;
        Cache::instance().set(cacheKey, result, ttl);
        res.set_content(result, "application/json");
    });

    // Get technical analysis
    svr.Get("/api/analysis/:symbol", [](const httplib::Request& req, httplib::Response& res) {
        auto symbol = req.path_params.at("symbol");
        auto period = req.get_param_value("period");
        if (period.empty()) period = "1y";

        std::string cacheKey = "analysis:" + symbol + ":" + period;
        std::string cached = Cache::instance().get(cacheKey);
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        // Get history data first
        std::string historyStr = subprocess::runPython("data_fetcher.py", "history " + symbol + " " + period);

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
        } catch (const std::exception& e) {
            json err;
            err["error"] = std::string("Analysis failed: ") + e.what();
            res.set_content(err.dump(), "application/json");
        }
    });

    // Get plain-English interpretation (Java)
    svr.Get("/api/interpret/:symbol", [](const httplib::Request& req, httplib::Response& res) {
        auto symbol = req.path_params.at("symbol");

        std::string cacheKey = "interpret:" + symbol;
        std::string cached = Cache::instance().get(cacheKey);
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        // Get quote data to pass to interpreter
        std::string quoteStr = subprocess::runPython("data_fetcher.py", "quote " + symbol);

        // Pipe quote data to Java interpreter via stdin
        std::string result = subprocess::runJava("analyzer.Interpreter", "", quoteStr);

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

        std::string cacheKey = "news:" + symbol;
        std::string cached = Cache::instance().get(cacheKey);
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        std::string result = subprocess::runPython("news_fetcher.py", symbol);
        Cache::instance().set(cacheKey, result, 300); // Cache 5 min
        res.set_content(result, "application/json");
    });

    // Get glossary (Java)
    svr.Get("/api/glossary", [](const httplib::Request&, httplib::Response& res) {
        std::string cached = Cache::instance().get("glossary");
        if (!cached.empty()) {
            res.set_content(cached, "application/json");
            return;
        }

        std::string result = subprocess::runJava("analyzer.Glossary", "all");

        if (!result.empty()) {
            Cache::instance().set("glossary", result, 3600); // Cache 1 hour
            res.set_content(result, "application/json");
        } else {
            res.set_content("{\"terms\":[]}", "application/json");
        }
    });

    // Clear cache
    svr.Post("/api/cache/clear", [](const httplib::Request&, httplib::Response& res) {
        Cache::instance().clear();
        res.set_content("{\"status\":\"cleared\"}", "application/json");
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

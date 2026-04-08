#include "subprocess_pool.h"
#include "subprocess.h"
#include "json.hpp"
#include <iostream>
#include <thread>
#include <chrono>
#include <atomic>
#include <filesystem>

#ifndef _WIN32
#include <unistd.h>
#include <signal.h>
#include <sys/wait.h>
#include <poll.h>
#include <fcntl.h>
#endif

using json = nlohmann::json;

namespace subprocess_pool {

// ================================================================
// Persistent Python subprocess that handles requests via JSON lines
// over stdin/stdout. Eliminates ~500ms Python startup per request.
// ================================================================

static std::mutex poolMtx;
static std::atomic<bool> poolReady{false};
static std::atomic<bool> poolShutdown{false};

#ifndef _WIN32
static pid_t servicePid = -1;
static int serviceStdinFd = -1;   // write end — we send requests here
static int serviceStdoutFd = -1;  // read end — we read responses here

void init() {
    std::lock_guard<std::mutex> lock(poolMtx);
    if (poolReady.load()) return;

    std::string base = subprocess::getBasePath();
    std::string scriptPath = base + "/python/data_service.py";
    if (!std::filesystem::exists(scriptPath)) {
        scriptPath = base + "/../src/python/data_service.py";
    }
    if (!std::filesystem::exists(scriptPath)) {
        std::cerr << "[pool] data_service.py not found, persistent mode disabled" << std::endl;
        return;
    }

    // Find Python executable (reuse logic from subprocess.cpp)
    std::string python;
    std::string home = getenv("HOME") ? getenv("HOME") : "";
    std::vector<std::string> candidates = {
        base + "/python-env/bin/python3",
        "/opt/homebrew/bin/python3",
    };
    if (!home.empty()) {
        candidates.push_back(home + "/.local/bin/python3");
    }
    candidates.push_back("/usr/local/bin/python3");
    candidates.push_back("/usr/bin/python3");

    for (auto& c : candidates) {
        if (std::filesystem::exists(c)) { python = c; break; }
    }
    if (python.empty()) {
        std::cerr << "[pool] python3 not found, persistent mode disabled" << std::endl;
        return;
    }

    // Create pipes
    int toChild[2], fromChild[2];
    if (pipe(toChild) < 0 || pipe(fromChild) < 0) {
        std::cerr << "[pool] pipe creation failed" << std::endl;
        return;
    }

    pid_t pid = fork();
    if (pid < 0) {
        std::cerr << "[pool] fork failed" << std::endl;
        return;
    }

    if (pid == 0) {
        // Child
        close(toChild[1]);
        close(fromChild[0]);
        dup2(toChild[0], STDIN_FILENO);
        dup2(fromChild[1], STDOUT_FILENO);
        close(toChild[0]);
        close(fromChild[1]);

        // Redirect stderr to /dev/null to avoid pollution
        int devnull = open("/dev/null", O_WRONLY);
        if (devnull >= 0) {
            dup2(devnull, STDERR_FILENO);
            close(devnull);
        }

        // Clean env
        unsetenv("VIRTUAL_ENV");
        unsetenv("CONDA_PREFIX");
        unsetenv("CONDA_DEFAULT_ENV");
        unsetenv("PYTHONHOME");
        unsetenv("PYTHONPATH");
        unsetenv("__PYVENV_LAUNCHER__");

#if defined(__APPLE__) && defined(__aarch64__)
        bool isBundled = python.rfind(base, 0) == 0;
        if (!isBundled) {
            execl("/usr/bin/arch", "arch", "-arm64", python.c_str(), scriptPath.c_str(), nullptr);
        } else {
            execl(python.c_str(), python.c_str(), scriptPath.c_str(), nullptr);
        }
#else
        execl(python.c_str(), python.c_str(), scriptPath.c_str(), nullptr);
#endif
        _exit(127);
    }

    // Parent
    close(toChild[0]);
    close(fromChild[1]);

    serviceStdinFd = toChild[1];
    serviceStdoutFd = fromChild[0];
    servicePid = pid;

    // Read the "ready" message
    char buf[4096];
    struct pollfd pfd = {serviceStdoutFd, POLLIN, 0};
    if (poll(&pfd, 1, 5000) > 0) {
        ssize_t n = read(serviceStdoutFd, buf, sizeof(buf) - 1);
        if (n > 0) {
            buf[n] = '\0';
            std::string readyMsg(buf);
            if (readyMsg.find("ready") != std::string::npos) {
                poolReady.store(true);
                std::cerr << "[pool] Python data service started (pid=" << pid << ")" << std::endl;
                return;
            }
        }
    }

    std::cerr << "[pool] Failed to start Python data service, falling back to per-request mode" << std::endl;
    kill(pid, SIGTERM);
    waitpid(pid, nullptr, 0);
    close(serviceStdinFd);
    close(serviceStdoutFd);
    serviceStdinFd = -1;
    serviceStdoutFd = -1;
    servicePid = -1;
}

std::string request(const std::string& cmd, const std::string& argsJson) {
    // Fast path: use persistent service
    if (poolReady.load() && serviceStdinFd >= 0) {
        std::lock_guard<std::mutex> lock(poolMtx);

        // Build request
        json req;
        req["cmd"] = cmd;
        req["args"] = json::parse(argsJson);
        std::string line = req.dump() + "\n";

        // Write request
        const char* data = line.c_str();
        size_t remaining = line.size();
        while (remaining > 0) {
            ssize_t written = write(serviceStdinFd, data, remaining);
            if (written <= 0) {
                // Pipe broken — service died
                poolReady.store(false);
                goto fallback;
            }
            data += written;
            remaining -= written;
        }

        // Read response (one JSON line)
        std::string response;
        char buf[8192];
        struct pollfd pfd = {serviceStdoutFd, POLLIN, 0};
        while (true) {
            int ret = poll(&pfd, 1, 15000); // 15s timeout
            if (ret <= 0) {
                // Timeout or error
                poolReady.store(false);
                goto fallback;
            }
            ssize_t n = read(serviceStdoutFd, buf, sizeof(buf) - 1);
            if (n <= 0) {
                poolReady.store(false);
                goto fallback;
            }
            buf[n] = '\0';
            response += buf;
            // Check if we have a complete JSON line
            if (response.find('\n') != std::string::npos) {
                // Return just the first line
                size_t nl = response.find('\n');
                return response.substr(0, nl);
            }
        }
    }

fallback:
    // Slow path: per-request subprocess (original behavior)
    if (cmd == "search") {
        auto args = json::parse(argsJson);
        std::string query = args[0].get<std::string>();
        return subprocess::runPython("data_fetcher.py", {"search", query});
    } else if (cmd == "quote") {
        auto args = json::parse(argsJson);
        std::string symbol = args[0].get<std::string>();
        return subprocess::runPython("data_fetcher.py", {"quote", symbol});
    } else if (cmd == "history") {
        auto args = json::parse(argsJson);
        std::string symbol = args[0].get<std::string>();
        std::string period = args.size() > 1 ? args[1].get<std::string>() : "1mo";
        return subprocess::runPython("data_fetcher.py", {"history", symbol, period});
    } else if (cmd == "news") {
        auto args = json::parse(argsJson);
        std::string symbol = args[0].get<std::string>();
        return subprocess::runPython("news_fetcher.py", {symbol});
    }
    return "{\"error\":\"Unknown command\"}";
}

void shutdown() {
    std::lock_guard<std::mutex> lock(poolMtx);
    poolShutdown.store(true);
    poolReady.store(false);

    if (serviceStdinFd >= 0) close(serviceStdinFd);
    if (serviceStdoutFd >= 0) close(serviceStdoutFd);
    serviceStdinFd = -1;
    serviceStdoutFd = -1;

    if (servicePid > 0) {
        kill(servicePid, SIGTERM);
        waitpid(servicePid, nullptr, 0);
        servicePid = -1;
    }
}

#else
// Windows: for now, delegate directly to per-request subprocess
// The persistent service can be added later with CreateProcess + named pipes

void init() {
    // No-op on Windows for now
}

std::string request(const std::string& cmd, const std::string& argsJson) {
    auto args = json::parse(argsJson);
    if (cmd == "search") {
        return subprocess::runPython("data_fetcher.py", {"search", args[0].get<std::string>()});
    } else if (cmd == "quote") {
        return subprocess::runPython("data_fetcher.py", {"quote", args[0].get<std::string>()});
    } else if (cmd == "history") {
        std::string period = args.size() > 1 ? args[1].get<std::string>() : "1mo";
        return subprocess::runPython("data_fetcher.py", {"history", args[0].get<std::string>(), period});
    } else if (cmd == "news") {
        return subprocess::runPython("news_fetcher.py", {args[0].get<std::string>()});
    }
    return "{\"error\":\"Unknown command\"}";
}

void shutdown() {}

#endif

} // namespace subprocess_pool

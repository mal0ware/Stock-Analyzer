#pragma once
#include <string>
#include <mutex>
#include <condition_variable>

namespace subprocess_pool {

// Initialize the persistent Python data service subprocess.
// Call once at startup. Non-blocking — the service starts in the background.
void init();

// Send a request to the persistent Python data service and get the response.
// Thread-safe. Blocks until the response is received.
// If the persistent service is not available, falls back to per-request subprocess.
// cmd: one of "quote", "history", "search", "news"
// args: JSON-serialized arguments array, e.g. ["AAPL"] or ["AAPL", "1y"]
std::string request(const std::string& cmd, const std::string& argsJson);

// Shut down the persistent subprocess.
void shutdown();

} // namespace subprocess_pool

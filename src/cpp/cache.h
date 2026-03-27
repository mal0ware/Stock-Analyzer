#pragma once
#include <string>
#include <unordered_map>
#include <chrono>
#include <mutex>

class Cache {
public:
    static Cache& instance();

    // Get cached value. Returns empty string if not found or expired.
    std::string get(const std::string& key);

    // Set cached value with TTL in seconds
    void set(const std::string& key, const std::string& value, int ttlSeconds = 60);

    // Clear all cached data
    void clear();

    // Remove a specific key
    void remove(const std::string& key);

private:
    Cache() = default;

    struct Entry {
        std::string value;
        std::chrono::steady_clock::time_point expiry;
    };

    std::unordered_map<std::string, Entry> store;
    std::mutex mtx;
};

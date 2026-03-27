#include "cache.h"

Cache& Cache::instance() {
    static Cache cache;
    return cache;
}

std::string Cache::get(const std::string& key) {
    std::lock_guard<std::mutex> lock(mtx);
    auto it = store.find(key);
    if (it == store.end()) return "";

    if (std::chrono::steady_clock::now() > it->second.expiry) {
        store.erase(it);
        return "";
    }

    return it->second.value;
}

void Cache::set(const std::string& key, const std::string& value, int ttlSeconds) {
    std::lock_guard<std::mutex> lock(mtx);
    store[key] = {
        value,
        std::chrono::steady_clock::now() + std::chrono::seconds(ttlSeconds)
    };
}

void Cache::clear() {
    std::lock_guard<std::mutex> lock(mtx);
    store.clear();
}

void Cache::remove(const std::string& key) {
    std::lock_guard<std::mutex> lock(mtx);
    store.erase(key);
}

#include "server.h"
#include "subprocess.h"
#include <iostream>
#include <thread>
#include <chrono>
#include <csignal>
#include <cstdlib>
#include <string>

static const int PORT = 8089;

static void signalHandler(int) {
    server::stop();
    exit(0);
}

int main(int argc, char* argv[]) {
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);

    bool headless = false;
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--headless" || arg == "-H") {
            headless = true;
        }
    }

    // Start HTTP server in background thread
    std::thread serverThread([]() {
        server::start(PORT);
    });
    serverThread.detach();

    // Wait for server to be ready
    std::this_thread::sleep_for(std::chrono::milliseconds(500));

    std::string url = "http://127.0.0.1:" + std::to_string(PORT);
    std::cout << "Stock Analyzer backend running at " << url << std::endl;

    if (headless) {
        std::cout << "Press Ctrl+C to stop." << std::endl;
    }

    // Block until killed
    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }

    server::stop();
    return 0;
}

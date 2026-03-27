#pragma once
#include <string>
#include <functional>

namespace server {

// Start the HTTP server on the given port. Blocks until stop() is called.
void start(int port = 8089);

// Stop the server
void stop();

// Get the port the server is running on
int getPort();

} // namespace server

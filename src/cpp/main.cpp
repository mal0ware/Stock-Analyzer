#include "server.h"
#include "subprocess.h"
#include <iostream>
#include <thread>
#include <chrono>
#include <csignal>
#include <cstdlib>
#include <string>

#if defined(__linux__) && !defined(NO_GUI)
#include <gtk/gtk.h>
#include <webkit2/webkit2.h>
#define HAS_GUI 1
#endif

static const int PORT = 8089;

static void signalHandler(int) {
    server::stop();
    exit(0);
}

#ifdef HAS_GUI
static void onDestroy(GtkWidget*, gpointer) {
    server::stop();
    gtk_main_quit();
}

static gboolean launchWebview(gpointer) {
    GtkWidget* window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(window), "Stock Analyzer");
    gtk_window_set_default_size(GTK_WINDOW(window), 1280, 850);
    gtk_window_set_position(GTK_WINDOW(window), GTK_WIN_POS_CENTER);

    // Set window icon name
    gtk_window_set_icon_name(GTK_WINDOW(window), "applications-office");

    g_signal_connect(window, "destroy", G_CALLBACK(onDestroy), nullptr);

    WebKitWebView* webview = WEBKIT_WEB_VIEW(webkit_web_view_new());

    // Configure settings
    WebKitSettings* settings = webkit_web_view_get_settings(webview);
    webkit_settings_set_javascript_can_access_clipboard(settings, TRUE);
    webkit_settings_set_enable_developer_extras(settings, FALSE);

    gtk_container_add(GTK_CONTAINER(window), GTK_WIDGET(webview));

    std::string url = "http://127.0.0.1:" + std::to_string(PORT);
    webkit_web_view_load_uri(webview, url.c_str());

    gtk_widget_show_all(window);

    return FALSE; // Don't repeat
}
#endif

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

    std::cout << "Stock Analyzer running at http://127.0.0.1:" << PORT << std::endl;

    if (headless) {
        std::cout << "Running in headless mode. Press Ctrl+C to stop." << std::endl;
        // Block forever in headless mode
        while (true) {
            std::this_thread::sleep_for(std::chrono::seconds(1));
        }
    }

#ifdef HAS_GUI
    gtk_init(&argc, &argv);

    // Schedule webview launch on GTK main loop
    g_idle_add(launchWebview, nullptr);

    gtk_main();
#else
    std::cout << "Running in headless mode (GUI not compiled)." << std::endl;
    std::cout << "Open http://127.0.0.1:" << PORT << " in your browser." << std::endl;
    std::cout << "Install libwebkit2gtk-4.1-dev and rebuild for native window." << std::endl;
    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }
#endif

    server::stop();
    return 0;
}

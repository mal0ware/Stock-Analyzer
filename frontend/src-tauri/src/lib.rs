use std::net::TcpStream;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

/// Check if the backend is accepting connections on port 8080.
fn backend_ready() -> bool {
    TcpStream::connect_timeout(
        &"127.0.0.1:8080".parse().unwrap(),
        Duration::from_secs(1),
    )
    .is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Launch the Python backend sidecar (invisible to the user).
            // The sidecar serves the React frontend + API on port 8080.
            let sidecar = app
                .shell()
                .sidecar("market-analyst-api")
                .expect("failed to create sidecar command");

            let (_rx, _child) = sidecar.spawn().expect("failed to spawn sidecar");

            // Wait for the backend to be ready, then show the window.
            // The window starts hidden (configured in tauri.conf.json).
            let window = app.get_webview_window("main").unwrap();
            std::thread::spawn(move || {
                // Poll until the backend is accepting connections (up to 30s)
                for _ in 0..60 {
                    if backend_ready() {
                        // Small buffer for uvicorn to finish startup
                        std::thread::sleep(Duration::from_millis(200));
                        let _ = window.eval("window.location.replace('http://localhost:8080')");
                        std::thread::sleep(Duration::from_millis(500));
                        let _ = window.show();
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(500));
                }
                // Timeout fallback — show window anyway
                let _ = window.show();
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}

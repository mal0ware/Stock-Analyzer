use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

/// Check if the backend is accepting connections on port 8080.
fn backend_ready() -> bool {
    TcpStream::connect_timeout(&"127.0.0.1:8089".parse().unwrap(), Duration::from_secs(1))
        .is_ok()
}

/// Holds the backend child process so it's killed when the app exits.
struct Backend(Mutex<Option<Child>>);

impl Drop for Backend {
    fn drop(&mut self) {
        if let Some(mut child) = self.0.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}

/// Inline loading splash shown instantly while the backend starts.
const LOADING_HTML: &str = r#"
document.documentElement.innerHTML = `
<head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0e17;
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    flex-direction: column;
    gap: 24px;
  }
  h1 { font-size: 28px; font-weight: 600; letter-spacing: -0.5px; }
  .spinner {
    width: 40px; height: 40px;
    border: 3px solid #1e293b;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  p { color: #64748b; font-size: 14px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style></head>
<body>
  <h1>AI Market Analyst</h1>
  <div class="spinner"></div>
  <p>Starting up…</p>
</body>`;
"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Resolve the sidecar directory inside bundled resources.
            let resource_dir = app
                .path()
                .resource_dir()
                .expect("failed to resolve resource dir");
            let sidecar_dir = resource_dir.join("resources").join("sidecar");

            let exe_name = if cfg!(windows) {
                "market-analyst-api.exe"
            } else {
                "market-analyst-api"
            };
            let sidecar_exe = sidecar_dir.join(exe_name);

            // Launch the Python backend from its own directory so PyInstaller
            // --onedir can find _internal/ and all shared libraries.
            let child = Command::new(&sidecar_exe)
                .current_dir(&sidecar_dir)
                .spawn()
                .unwrap_or_else(|e| panic!("failed to spawn backend at {:?}: {}", sidecar_exe, e));

            // Store handle — Drop impl kills the process on app exit.
            app.manage(Backend(Mutex::new(Some(child))));

            // Show the window immediately with a loading splash.
            let window = app.get_webview_window("main").unwrap();
            let _ = window.eval(LOADING_HTML);
            let _ = window.show();

            // Poll for backend readiness, then navigate to the app.
            std::thread::spawn(move || {
                for _ in 0..120 {
                    if backend_ready() {
                        std::thread::sleep(Duration::from_millis(200));
                        let _ =
                            window.eval("window.location.replace('http://localhost:8089')");
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(500));
                }
                // 60-second timeout — show error in the window.
                let _ = window.eval(
                    "document.querySelector('p').textContent = \
                     'Backend failed to start. Please restart the app.'",
                );
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}

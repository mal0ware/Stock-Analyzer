use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Launch the Python backend as a sidecar process
            let sidecar = app
                .shell()
                .sidecar("market-analyst-api")
                .expect("failed to create sidecar command");
            let (_rx, _child) = sidecar.spawn().expect("failed to spawn sidecar");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}

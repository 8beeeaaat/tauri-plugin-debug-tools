use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};
use tauri_plugin_log::{log, Target, TargetKind};

mod commands;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("debug-tools")
        .setup(|app, _api| {
            let log_plugin = tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("debug.log".to_string()),
                    }),
                    Target::new(TargetKind::Webview),
                ])
                .max_file_size(50_000) // 50KB auto-rotation
                .filter(|metadata| {
                    // Filter out verbose tao internal logs
                    let target = metadata.target();
                    !(target.starts_with("tao::") && metadata.level() == log::Level::Trace)
                })
                .build();
            let screenshots_plugin = tauri_plugin_screenshots::init();

            // Register plugins synchronously to ensure they're available
            if let Err(e) = app.plugin(log_plugin) {
                eprintln!("[debug-tools] Failed to register log plugin: {}", e);
            }
            if let Err(e) = app.plugin(screenshots_plugin) {
                eprintln!("[debug-tools] Failed to register screenshots plugin: {}", e);
            }

            // DEV-only HTTP trigger (e.g., GET http://127.0.0.1:39393/capture_screenshot)
            if cfg!(debug_assertions)
                || std::env::var("TAURI_DEBUG_HTTP").as_deref() == Ok("1")
            {
                commands::start_http_trigger(app.app_handle().clone());
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::capture_webview_state,
            commands::get_console_logs,
            commands::send_debug_command,
            commands::capture_screenshot,
            commands::append_debug_logs,
            commands::reset_debug_logs,
            commands::write_debug_snapshot,
            commands::auto_capture_debug_snapshot,
        ])
        .build()
}

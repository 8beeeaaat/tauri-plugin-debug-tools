use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};
use tauri_plugin_log::{Target, TargetKind};

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
                .build();
            let screenshots_plugin = tauri_plugin_screenshots::init();

            let handle = app.app_handle().clone();
            std::thread::spawn(move || {
                let _ = handle.plugin(log_plugin);
                let _ = handle.plugin(screenshots_plugin);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::capture_webview_state,
            commands::get_console_logs,
            commands::send_debug_command,
            commands::append_debug_logs,
            commands::reset_debug_logs,
            commands::write_debug_snapshot,
        ])
        .build()
}

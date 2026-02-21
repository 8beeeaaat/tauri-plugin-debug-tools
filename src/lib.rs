use std::sync::Arc;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

mod adapters;
mod application;
mod commands;
mod config;
mod domain;

pub use config::DebugToolsConfig;
pub use domain::{ConsoleLogEntry, DebugSnapshot, DomSnapshotResult, WebViewState};

use adapters::{init_tracing, FileSystemRepository};
use application::{AppendConsoleLogsUseCase, CaptureDebugSnapshotUseCase, SaveDomSnapshotUseCase};
use config::ConfigError;

pub struct DebugToolsState {
    pub config: Arc<DebugToolsConfig>,
    pub repository: Arc<FileSystemRepository>,
    pub append_logs_use_case: Arc<AppendConsoleLogsUseCase<FileSystemRepository>>,
    pub save_dom_use_case: Arc<SaveDomSnapshotUseCase<FileSystemRepository>>,
    pub capture_snapshot_use_case: Arc<CaptureDebugSnapshotUseCase<FileSystemRepository>>,
    #[allow(dead_code)]
    tracing_guard: adapters::logging::TracingGuard,
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("debug-tools")
        .setup(|app, _api| {
            let config = Arc::new(
                DebugToolsConfig::from_app_handle(&app.app_handle())
                    .map_err(|e: ConfigError| e.to_string())?,
            );

            config.ensure_subdirectories().map_err(|e| e.to_string())?;

            let tracing_guard = init_tracing(config.clone()).map_err(|e| e.to_string())?;

            tracing::info!(
                log_dir = %config.log_dir.display(),
                "Debug tools plugin initialized"
            );

            let app_name = app.package_info().name.clone();
            let repository = Arc::new(FileSystemRepository::new(config.clone(), app_name));

            let append_logs_use_case = Arc::new(AppendConsoleLogsUseCase::new(repository.clone()));
            let save_dom_use_case = Arc::new(SaveDomSnapshotUseCase::new(repository.clone()));
            let capture_snapshot_use_case =
                Arc::new(CaptureDebugSnapshotUseCase::new(repository.clone()));

            let state = DebugToolsState {
                config,
                repository,
                append_logs_use_case,
                save_dom_use_case,
                capture_snapshot_use_case,
                tracing_guard,
            };

            app.manage(state);

            let screenshots_plugin = tauri_plugin_screenshots::init();
            let handle = app.app_handle().clone();
            std::thread::spawn(move || {
                if let Err(e) = handle.plugin(screenshots_plugin) {
                    tracing::error!(error = %e, "Failed to initialize screenshots plugin");
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::capture_webview_state,
            commands::get_console_logs,
            commands::send_debug_command,
            commands::append_debug_logs,
            commands::reset_debug_logs,
            commands::clear_debug_log_files_command,
            commands::copy_screenshot_to_debug_dir,
            commands::write_debug_snapshot,
            commands::capture_dom_snapshot,
            commands::capture_full_debug_state,
            commands::get_log_directory,
        ])
        .build()
}

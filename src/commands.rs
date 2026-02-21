use crate::adapters::filesystem::reset_console_logs;
use crate::application::CaptureWebViewStateUseCase;
use crate::domain::{ConsoleLogEntry, DebugSnapshot, DomSnapshotResult, WebViewState};
use crate::DebugToolsState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct ConsoleMessage {
    pub level: String,
    pub message: String,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConsoleLogEntryPayload {
    pub timestamp: i64,
    pub level: String,
    pub message: String,
    pub args: serde_json::Value,
    pub stack_trace: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DomSnapshotPayload {
    pub html: String,
    pub url: String,
    pub title: String,
    pub viewport_width: u32,
    pub viewport_height: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LogDirectoryInfo {
    pub base_dir: String,
    pub frontend_log: String,
    pub backend_log: String,
    pub screenshot_dir: String,
    pub dom_snapshot_dir: String,
}

#[tauri::command]
#[tracing::instrument(skip(app))]
pub async fn capture_webview_state<R: Runtime>(
    app: AppHandle<R>,
) -> Result<WebViewState, String> {
    CaptureWebViewStateUseCase::execute(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_console_logs<R: Runtime>(
    _app: AppHandle<R>,
) -> Result<Vec<ConsoleMessage>, String> {
    Ok(vec![])
}

#[tauri::command]
#[tracing::instrument(skip(app, payload))]
pub async fn send_debug_command<R: Runtime>(
    app: AppHandle<R>,
    command: String,
    payload: serde_json::Value,
) -> Result<String, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    window
        .emit("debug-command", (command.clone(), payload))
        .map_err(|e| format!("Failed to send debug command: {}", e))?;

    tracing::info!(command = %command, "Debug command sent to frontend");

    Ok("Command sent to frontend".to_string())
}

#[tauri::command]
#[tracing::instrument(skip(app, logs))]
pub async fn append_debug_logs<R: Runtime>(
    app: AppHandle<R>,
    logs: Vec<ConsoleLogEntryPayload>,
) -> Result<String, String> {
    let state: State<'_, DebugToolsState> = app.state();

    let entries: Vec<ConsoleLogEntry> = logs
        .into_iter()
        .map(|p| ConsoleLogEntry {
            timestamp: p.timestamp,
            level: p.level,
            message: p.message,
            args: p.args,
            stack_trace: p.stack_trace,
        })
        .collect();

    state
        .append_logs_use_case
        .execute(entries)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[tracing::instrument(skip(app))]
pub async fn reset_debug_logs<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let state: State<'_, DebugToolsState> = app.state();
    let app_name = app.package_info().name.clone();
    let pid = std::process::id();

    let path =
        reset_console_logs(&state.config, &app_name, pid).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
#[tracing::instrument(skip(payload))]
pub async fn write_debug_snapshot(payload: serde_json::Value) -> Result<String, String> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to get timestamp: {}", e))?
        .as_secs();

    let path = std::env::temp_dir().join(format!("tauri_debug_snapshot_{}.json", ts));
    let json = serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("Failed to serialize payload: {}", e))?;

    std::fs::write(&path, json).map_err(|e| format!("Failed to write file: {}", e))?;

    tracing::info!(path = %path.display(), "Legacy debug snapshot saved");

    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
#[tracing::instrument(skip(app, payload))]
pub async fn capture_dom_snapshot<R: Runtime>(
    app: AppHandle<R>,
    payload: DomSnapshotPayload,
) -> Result<DomSnapshotResult, String> {
    let state: State<'_, DebugToolsState> = app.state();

    state
        .save_dom_use_case
        .execute(
            payload.html,
            payload.url,
            payload.title,
            payload.viewport_width,
            payload.viewport_height,
        )
        .map_err(|e| e.to_string())
}

fn validate_path_in_directory(
    path_str: &str,
    allowed_dir: &std::path::Path,
) -> Result<std::path::PathBuf, String> {
    let path = std::path::PathBuf::from(path_str);

    if path.components().any(|c| c == std::path::Component::ParentDir) {
        tracing::warn!(path = %path_str, "Path traversal attempt detected");
        return Err("Invalid path: directory traversal not allowed".into());
    }

    if !path.starts_with(allowed_dir) {
        tracing::warn!(
            path = %path_str,
            allowed_dir = %allowed_dir.display(),
            "Path outside allowed directory"
        );
        return Err("Invalid path: must be within log directory".into());
    }

    Ok(path)
}

#[tauri::command]
#[tracing::instrument(skip(app, console_logs))]
pub async fn capture_full_debug_state<R: Runtime>(
    app: AppHandle<R>,
    console_logs: Vec<ConsoleLogEntryPayload>,
    screenshot_path: Option<String>,
    dom_snapshot_path: Option<String>,
) -> Result<DebugSnapshot, String> {
    let state: State<'_, DebugToolsState> = app.state();

    let validated_screenshot = screenshot_path
        .map(|p| validate_path_in_directory(&p, &state.config.log_dir))
        .transpose()?;

    let validated_dom = dom_snapshot_path
        .map(|p| validate_path_in_directory(&p, &state.config.log_dir))
        .transpose()?;

    let entries: Vec<ConsoleLogEntry> = console_logs
        .into_iter()
        .map(|p| ConsoleLogEntry {
            timestamp: p.timestamp,
            level: p.level,
            message: p.message,
            args: p.args,
            stack_trace: p.stack_trace,
        })
        .collect();

    state
        .capture_snapshot_use_case
        .execute(&app, entries, validated_screenshot, validated_dom)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[tracing::instrument(skip(app))]
pub async fn get_log_directory<R: Runtime>(app: AppHandle<R>) -> Result<LogDirectoryInfo, String> {
    let state: State<'_, DebugToolsState> = app.state();
    let app_name = app.package_info().name.clone();
    let pid = std::process::id();

    Ok(LogDirectoryInfo {
        base_dir: state.config.log_dir.to_string_lossy().into_owned(),
        frontend_log: state
            .config
            .frontend_log_path(&app_name, pid)
            .to_string_lossy()
            .into_owned(),
        backend_log: state
            .config
            .backend_log_path()
            .to_string_lossy()
            .into_owned(),
        screenshot_dir: state
            .config
            .screenshot_dir()
            .to_string_lossy()
            .into_owned(),
        dom_snapshot_dir: state
            .config
            .dom_snapshot_dir()
            .to_string_lossy()
            .into_owned(),
    })
}

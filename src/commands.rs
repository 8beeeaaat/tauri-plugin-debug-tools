use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[derive(Debug, Serialize, Deserialize)]
pub struct WebViewState {
    pub url: String,
    pub title: String,
    pub user_agent: String,
    pub viewport: ViewportInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ViewportInfo {
    pub width: u32,
    pub height: u32,
}

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

/// Get WebView state.
#[tauri::command]
pub async fn capture_webview_state<R: Runtime>(app: AppHandle<R>) -> Result<WebViewState, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    let url = window.url().map_err(|e| e.to_string())?;
    let title = window.title().map_err(|e| e.to_string())?;

    // Fetch viewport information.
    let size = window
        .inner_size()
        .map_err(|e| format!("Failed to get window size: {}", e))?;

    Ok(WebViewState {
        url: url.to_string(),
        title,
        user_agent: "TauriWebView/2.0".to_string(), // TODO: Fetch the real User-Agent.
        viewport: ViewportInfo {
            width: size.width,
            height: size.height,
        },
    })
}

/// Get console logs.
/// NOTE: Prefer fetching logs directly on the frontend instead of buffering in Rust.
/// Use debugBridge.getConsoleLogs() to inspect logs without Safari DevTools.
#[tauri::command]
pub async fn get_console_logs<R: Runtime>(
    _app: AppHandle<R>,
) -> Result<Vec<ConsoleMessage>, String> {
    // Placeholder for backward compatibility.
    // Actual log collection happens in the frontend consoleLogger.
    Ok(vec![])
}

/// Send a message to the WebView for frontend handling.
/// Use event-based communication instead of eval().
#[tauri::command]
pub async fn send_debug_command<R: Runtime>(
    app: AppHandle<R>,
    command: String,
    payload: serde_json::Value,
) -> Result<String, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    // Emit event to the frontend.
    window
        .emit("debug-command", (command, payload))
        .map_err(|e| format!("Failed to send debug command: {}", e))?;

    Ok("Command sent to frontend".to_string())
}

/// Append console logs to /tmp.
#[tauri::command]
pub async fn append_debug_logs(logs: Vec<ConsoleLogEntryPayload>) -> Result<String, String> {
    if logs.is_empty() {
        return Ok("no logs".to_string());
    }

    let path = "/tmp/tauri_console_logs.jsonl";
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    for entry in logs {
        let line = serde_json::to_string(&entry)
            .map_err(|e| format!("Failed to serialize log entry: {}", e))?;
        use std::io::Write;
        writeln!(file, "{}", line).map_err(|e| format!("Failed to write log: {}", e))?;
    }

    Ok(path.to_string())
}

/// Reset the console log file.
#[tauri::command]
pub async fn reset_debug_logs() -> Result<String, String> {
    let path = "/tmp/tauri_console_logs.jsonl";
    std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(path)
        .map_err(|e| format!("Failed to reset log file: {}", e))?;
    Ok(path.to_string())
}

/// Save a debug snapshot to /tmp.
#[tauri::command]
pub async fn write_debug_snapshot(payload: serde_json::Value) -> Result<String, String> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to get timestamp: {}", e))?
        .as_secs();
    let path = format!("/tmp/tauri_debug_snapshot_{}.json", ts);
    let json = serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("Failed to serialize payload: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(path)
}

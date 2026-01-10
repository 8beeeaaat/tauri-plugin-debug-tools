use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Rate limiter for screenshot capture
static LAST_SCREENSHOT_TIME: Mutex<Option<Instant>> = Mutex::new(None);
const SCREENSHOT_COOLDOWN_SECS: u64 = 1;

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

fn build_console_log_path(base_dir: PathBuf, app_name: &str, pid: u32) -> PathBuf {
    base_dir.join(format!("tauri_console_logs_{}_{}.jsonl", app_name, pid))
}

fn console_log_path<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    // Get application name from AppHandle
    let app_name = app.package_info().name.replace(" ", "_");
    // Get current process ID
    let pid = std::process::id();
    // Use /tmp on Unix-like systems, temp_dir() on Windows
    #[cfg(unix)]
    let base_dir = PathBuf::from("/tmp");
    #[cfg(not(unix))]
    let base_dir = std::env::temp_dir();

    build_console_log_path(base_dir, &app_name, pid)
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

fn build_http_response(status: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status,
        body.len(),
        body
    )
}

fn write_http_response(mut stream: TcpStream, status: &str, body: &str) {
    let response = build_http_response(status, body);
    let _ = stream.write_all(response.as_bytes());
}

fn write_json_response(stream: TcpStream, status: &str, body: serde_json::Value) {
    let body = body.to_string();
    write_http_response(stream, status, &body);
}

fn parse_request_line(request_line: &str) -> Option<(String, String)> {
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();
    Some((method, path))
}

fn parse_query(path: &str) -> (&str, Vec<(String, String)>) {
    let mut parts = path.splitn(2, '?');
    let base = parts.next().unwrap_or(path);
    let query = parts.next().unwrap_or("");
    let params = query
        .split('&')
        .filter_map(|pair| {
            if pair.is_empty() {
                return None;
            }
            let mut kv = pair.splitn(2, '=');
            let key = kv.next()?.to_string();
            let value = kv.next().unwrap_or("").to_string();
            Some((key, value))
        })
        .collect();
    (base, params)
}

fn parse_console_error_logs(content: &str) -> Vec<String> {
    content
        .lines()
        .filter_map(|line| {
            let entry: Result<ConsoleLogEntryPayload, _> = serde_json::from_str(line);
            if let Ok(entry) = entry {
                if entry.level == "error" {
                    return Some(entry.message);
                }
            }
            None
        })
        .collect()
}

fn check_rate_limit(last_time: &mut Option<Instant>) -> Result<(), String> {
    if let Some(last) = *last_time {
        let elapsed = last.elapsed();
        if elapsed < Duration::from_secs(SCREENSHOT_COOLDOWN_SECS) {
            return Err(format!(
                "Rate limit: Please wait {} more seconds",
                (SCREENSHOT_COOLDOWN_SECS as f64 - elapsed.as_secs_f64()).ceil() as u64
            ));
        }
    }

    *last_time = Some(Instant::now());
    Ok(())
}

fn handle_http_request<R: Runtime>(app: &AppHandle<R>, mut stream: TcpStream) {
    let mut buffer = [0u8; 1024];
    let Ok(read_size) = stream.read(&mut buffer) else {
        return;
    };
    if read_size == 0 {
        return;
    }
    let request = String::from_utf8_lossy(&buffer[..read_size]);
    let mut lines = request.lines();
    let Some(request_line) = lines.next() else {
        return;
    };
    let Some((method, path)) = parse_request_line(request_line) else {
        return;
    };
    let (path, query) = parse_query(&path);

    if method != "GET" {
        write_http_response(
            stream,
            "405 Method Not Allowed",
            "{\"ok\":false,\"error\":\"method not allowed\"}",
        );
        return;
    }

    if path == "/health" {
        write_http_response(stream, "200 OK", "{\"ok\":true}");
        return;
    }

    if path == "/capture_screenshot" {
        let payload = serde_json::json!({ "source": "http-trigger" });
        if let Some(window) = app.get_webview_window("main") {
            match window.emit("debug-command", ("capture_screenshot", payload)) {
                Ok(_) => {
                    write_http_response(
                        stream,
                        "200 OK",
                        "{\"ok\":true,\"message\":\"capture_screenshot sent\"}",
                    );
                }
                Err(e) => {
                    let body = format!("{{\"ok\":false,\"error\":\"Failed to emit event: {}\"}}", e);
                    write_http_response(
                        stream,
                        "500 Internal Server Error",
                        &body,
                    );
                }
            }
            return;
        }
        write_http_response(
            stream,
            "500 Internal Server Error",
            "{\"ok\":false,\"error\":\"main window not found\"}",
        );
        return;
    }

    if path == "/capture_webview_state" {
        let result = tauri::async_runtime::block_on(capture_webview_state(app.clone()));
        match result {
            Ok(state) => {
                let body = serde_json::json!({ "ok": true, "state": state });
                write_json_response(stream, "200 OK", body);
            }
            Err(err) => {
                let body = serde_json::json!({ "ok": false, "error": err });
                write_json_response(stream, "500 Internal Server Error", body);
            }
        }
        return;
    }

    if path == "/screenshotable_windows" {
        let result = tauri::async_runtime::block_on(
            tauri_plugin_screenshots::get_screenshotable_windows(),
        );
        match result {
            Ok(windows) => {
                let body = serde_json::json!({ "ok": true, "windows": windows });
                write_json_response(stream, "200 OK", body);
            }
            Err(err) => {
                let body = serde_json::json!({ "ok": false, "error": err });
                write_json_response(stream, "500 Internal Server Error", body);
            }
        }
        return;
    }

    if path == "/auto_capture_debug_snapshot" {
        let result = tauri::async_runtime::block_on(auto_capture_debug_snapshot(app.clone()));
        match result {
            Ok(snapshot) => {
                let body = serde_json::json!({ "ok": true, "snapshot": snapshot });
                write_json_response(stream, "200 OK", body);
            }
            Err(err) => {
                let status = if err.starts_with("Rate limit") {
                    "429 Too Many Requests"
                } else {
                    "500 Internal Server Error"
                };
                let body = serde_json::json!({ "ok": false, "error": err });
                write_json_response(stream, status, body);
            }
        }
        return;
    }

    if path == "/console_errors" {
        match read_console_error_logs(app) {
            Ok(errors) => {
                let body = serde_json::json!({ "ok": true, "errors": errors });
                write_json_response(stream, "200 OK", body);
            }
            Err(err) => {
                let body = serde_json::json!({ "ok": false, "error": err });
                write_json_response(stream, "500 Internal Server Error", body);
            }
        }
        return;
    }

    if path == "/reset_debug_logs" {
        let result = tauri::async_runtime::block_on(reset_debug_logs(app.clone()));
        match result {
            Ok(path) => {
                let body = serde_json::json!({ "ok": true, "path": path });
                write_json_response(stream, "200 OK", body);
            }
            Err(err) => {
                let body = serde_json::json!({ "ok": false, "error": err });
                write_json_response(stream, "500 Internal Server Error", body);
            }
        }
        return;
    }

    if path == "/write_debug_snapshot" {
        let payload = serde_json::json!({ "source": "http-trigger" });
        let result = tauri::async_runtime::block_on(write_debug_snapshot(payload));
        match result {
            Ok(path) => {
                let body = serde_json::json!({ "ok": true, "path": path });
                write_json_response(stream, "200 OK", body);
            }
            Err(err) => {
                let body = serde_json::json!({ "ok": false, "error": err });
                write_json_response(stream, "500 Internal Server Error", body);
            }
        }
        return;
    }

    if path == "/send_debug_command" {
        let command = query
            .iter()
            .find(|(key, _)| key == "command")
            .map(|(_, value)| value.to_string())
            .unwrap_or_default();
        if command.is_empty() {
            write_http_response(
                stream,
                "400 Bad Request",
                "{\"ok\":false,\"error\":\"command is required\"}",
            );
            return;
        }
        let payload = serde_json::json!({});
        if let Some(window) = app.get_webview_window("main") {
            match window.emit("debug-command", (command, payload)) {
                Ok(_) => {
                    write_http_response(
                        stream,
                        "200 OK",
                        "{\"ok\":true,\"message\":\"debug command sent\"}",
                    );
                }
                Err(e) => {
                    let body = format!("{{\"ok\":false,\"error\":\"Failed to emit event: {}\"}}", e);
                    write_http_response(
                        stream,
                        "500 Internal Server Error",
                        &body,
                    );
                }
            }
            return;
        }
        write_http_response(
            stream,
            "500 Internal Server Error",
            "{\"ok\":false,\"error\":\"main window not found\"}",
        );
        return;
    }

    write_http_response(stream, "404 Not Found", "{\"ok\":false,\"error\":\"not found\"}");
}

pub fn start_http_trigger<R: Runtime>(app: AppHandle<R>) {
    let addr = std::env::var("TAURI_DEBUG_HTTP_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:39393".to_string());
    std::thread::spawn(move || {
        let listener = match TcpListener::bind(&addr) {
            Ok(listener) => listener,
            Err(err) => {
                eprintln!("[debug-tools] HTTP bind failed: {}", err);
                return;
            }
        };
        for stream in listener.incoming() {
            if let Ok(stream) = stream {
                handle_http_request(&app, stream);
            }
        }
    });
}

/// Request the frontend to capture a screenshot.
#[tauri::command]
pub async fn capture_screenshot<R: Runtime>(
    app: AppHandle<R>,
    payload: Option<serde_json::Value>,
) -> Result<String, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    let payload = payload.unwrap_or_else(|| serde_json::json!({}));
    window
        .emit("debug-command", ("capture_screenshot", payload))
        .map_err(|e| format!("Failed to send capture_screenshot: {}", e))?;

    Ok("Screenshot request sent to frontend".to_string())
}

/// Append console logs to /tmp.
#[tauri::command]
pub async fn append_debug_logs<R: Runtime>(
    app: AppHandle<R>,
    logs: Vec<ConsoleLogEntryPayload>,
) -> Result<String, String> {
    if logs.is_empty() {
        return Ok("no logs".to_string());
    }

    let path = console_log_path(&app);
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    for entry in logs {
        let line = serde_json::to_string(&entry)
            .map_err(|e| format!("Failed to serialize log entry: {}", e))?;
        use std::io::Write;
        writeln!(file, "{}", line).map_err(|e| format!("Failed to write log: {}", e))?;
    }

    Ok(path.to_string_lossy().into_owned())
}

/// Reset the console log file.
#[tauri::command]
pub async fn reset_debug_logs<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let path = console_log_path(&app);
    std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&path)
        .map_err(|e| format!("Failed to reset log file: {}", e))?;
    Ok(path.to_string_lossy().into_owned())
}

/// Save a debug snapshot to /tmp.
#[tauri::command]
pub async fn write_debug_snapshot(payload: serde_json::Value) -> Result<String, String> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to get timestamp: {}", e))?
        .as_secs();
    let path = std::env::temp_dir().join(format!("tauri_debug_snapshot_{}.json", ts));
    let json = serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("Failed to serialize payload: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(path.to_string_lossy().into_owned())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DebugSnapshotResult {
    pub screenshot_path: Option<String>,
    pub screenshot_error: Option<String>,
    pub webview_state: WebViewState,
    pub console_errors: Vec<String>,
    pub timestamp: u64,
}

/// Automatically capture a debug snapshot with screenshot for AI agent debugging.
/// This includes screenshot, WebView state, and recent console errors.
/// Rate-limited to prevent excessive captures (1 per second).
#[tauri::command]
pub async fn auto_capture_debug_snapshot<R: Runtime>(
    app: AppHandle<R>,
) -> Result<DebugSnapshotResult, String> {
    // Check rate limit (drop the lock before any await)
    {
        let mut last_time = LAST_SCREENSHOT_TIME
            .lock()
            .map_err(|e| format!("Failed to acquire lock: {}", e))?;

        check_rate_limit(&mut last_time)?;
    } // Lock is dropped here

    // Capture WebView state
    let webview_state = capture_webview_state(app.clone())
        .await
        .map_err(|e| format!("Failed to capture WebView state: {}", e))?;

    // Get console error logs from /tmp file
    let console_errors = read_console_error_logs(&app)?;

    // Capture screenshot using tauri-plugin-screenshots
    let screenshot_result = capture_screenshot_internal(&app).await;
    let (screenshot_path, screenshot_error) = match screenshot_result {
        Ok(path) => (Some(path), None),
        Err(err) => {
            eprintln!("Screenshot capture failed: {}", err);
            (None, Some(err))
        }
    };

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to get timestamp: {}", e))?
        .as_secs();

    Ok(DebugSnapshotResult {
        screenshot_path,
        screenshot_error,
        webview_state,
        console_errors,
        timestamp,
    })
}

/// Internal helper to capture screenshot from main window
async fn capture_screenshot_internal<R: Runtime>(app: &AppHandle<R>) -> Result<String, String> {
    use tauri_plugin_screenshots::{get_screenshotable_windows, get_window_screenshot};

    // Get all available windows
    let windows = get_screenshotable_windows().await
        .map_err(|e| format!("Failed to get screenshotable windows: {}. Check system permissions.", e))?;

    if windows.is_empty() {
        return Err("No screenshotable windows found. Ensure the application window is visible.".to_string());
    }

    if let Ok(raw_id) = std::env::var("TAURI_DEBUG_SCREENSHOT_WINDOW_ID") {
        if let Ok(window_id) = raw_id.parse::<u32>() {
            if let Some(target) = windows.iter().find(|window| window.id == window_id) {
                eprintln!(
                    "Capturing screenshot of window override: id={}, name={}",
                    target.id, target.name
                );
                let screenshot_path = get_window_screenshot(app.clone(), target.id).await
                    .map_err(|e| format!("Failed to capture window {}: {}. Check disk space and permissions.", target.id, e))?;
                return Ok(screenshot_path.to_string_lossy().to_string());
            }
        }
    }

    // Prefer matching by app name (package/product) and optional main window title.
    let app_identifier = app.package_info().name.clone();
    let mut candidate_names = vec![app_identifier];
    if let Some(product_name) = app.config().product_name.clone() {
        if !candidate_names.contains(&product_name) {
            candidate_names.push(product_name);
        }
    }

    let main_title = app
        .get_webview_window("main")
        .and_then(|window| window.title().ok())
        .filter(|title| !title.is_empty());

    let is_system_window = |window: &tauri_plugin_screenshots::ScreenshotableWindow| {
        window.app_name == "コントロールセンター"
            || window.app_name == "Window Server"
            || window.app_name == "WindowManager"
            || window.app_name == "通知センター"
    };

    let matches_candidate = |window: &tauri_plugin_screenshots::ScreenshotableWindow| {
        candidate_names
            .iter()
            .any(|name| window.app_name == *name)
    };

    let target_window = windows
        .iter()
        .find(|window| {
            matches_candidate(window)
                && main_title
                    .as_ref()
                    .map_or(true, |title| window.title == *title)
        })
        .or_else(|| windows.iter().find(|window| matches_candidate(window)))
        .or_else(|| {
            windows.iter().find(|window| {
                candidate_names
                    .iter()
                    .any(|name| window.name.contains(name))
            })
        })
        .or_else(|| windows.iter().find(|window| !is_system_window(window)))
        .or_else(|| windows.first())
        .ok_or_else(|| "No suitable window found for screenshot".to_string())?;

    eprintln!("Capturing screenshot of window: id={}, name={}", target_window.id, target_window.name);

    // Capture screenshot using tauri-plugin-screenshots
    let screenshot_path = get_window_screenshot(app.clone(), target_window.id).await
        .map_err(|e| format!("Failed to capture window {}: {}. Check disk space and permissions.", target_window.id, e))?;

    Ok(screenshot_path.to_string_lossy().to_string())
}

/// Read recent console error logs from /tmp
fn read_console_error_logs<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<String>, String> {
    let path = console_log_path(app);

    if !path.exists() {
        return Ok(vec![]);
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read log file: {}", e))?;

    Ok(parse_console_error_logs(&content))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn build_http_response_includes_length() {
        let body = "{\"ok\":true}";
        let response = build_http_response("200 OK", body);
        assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(response.contains("Content-Type: application/json\r\n"));
        assert!(response.contains("Content-Length: 11\r\n"));
        assert!(response.ends_with(body));
    }

    #[test]
    fn parse_request_line_valid() {
        let line = "GET /capture_screenshot HTTP/1.1";
        let parsed = parse_request_line(line);
        assert_eq!(
            parsed,
            Some(("GET".to_string(), "/capture_screenshot".to_string()))
        );
    }

    #[test]
    fn parse_request_line_invalid() {
        let parsed = parse_request_line("");
        assert!(parsed.is_none());
    }

    #[test]
    fn parse_query_splits_base_and_params() {
        let (base, params) = parse_query("/send_debug_command?command=ping&foo=bar");
        assert_eq!(base, "/send_debug_command");
        assert_eq!(
            params,
            vec![("command".to_string(), "ping".to_string()), ("foo".to_string(), "bar".to_string())]
        );
    }

    #[test]
    fn parse_query_handles_empty() {
        let (base, params) = parse_query("/health");
        assert_eq!(base, "/health");
        assert!(params.is_empty());
    }

    #[test]
    fn parse_console_error_logs_filters_errors() {
        let ok_entry = ConsoleLogEntryPayload {
            timestamp: 1,
            level: "info".to_string(),
            message: "ok".to_string(),
            args: serde_json::json!(["a"]),
            stack_trace: None,
        };
        let err_entry = ConsoleLogEntryPayload {
            timestamp: 2,
            level: "error".to_string(),
            message: "boom".to_string(),
            args: serde_json::json!(["b"]),
            stack_trace: None,
        };
        let content = format!(
            "{}\n{}\nnot-json\n",
            serde_json::to_string(&ok_entry).unwrap(),
            serde_json::to_string(&err_entry).unwrap()
        );
        let errors = parse_console_error_logs(&content);
        assert_eq!(errors, vec!["boom".to_string()]);
    }

    #[test]
    fn check_rate_limit_allows_after_cooldown() {
        let mut last_time = Some(Instant::now() - Duration::from_secs(2));
        let result = check_rate_limit(&mut last_time);
        assert!(result.is_ok());
        assert!(last_time.is_some());
    }

    #[test]
    fn check_rate_limit_blocks_immediately() {
        let mut last_time = Some(Instant::now());
        let result = check_rate_limit(&mut last_time);
        assert!(result.is_err());
    }
}

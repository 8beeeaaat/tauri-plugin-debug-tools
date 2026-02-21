use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebViewState {
    pub url: String,
    pub title: String,
    pub user_agent: String,
    pub viewport: ViewportInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewportInfo {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsoleLogEntry {
    pub timestamp: i64,
    pub level: String,
    pub message: String,
    pub args: serde_json::Value,
    pub stack_trace: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomState {
    pub html: String,
    pub url: String,
    pub title: String,
    pub viewport: ViewportInfo,
    pub captured_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebugSnapshot {
    pub timestamp: i64,
    pub webview_state: WebViewState,
    pub console_logs: Vec<ConsoleLogEntry>,
    pub screenshot_path: Option<PathBuf>,
    pub dom_snapshot_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomSnapshotResult {
    pub path: PathBuf,
    pub metadata: DomSnapshotMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomSnapshotMetadata {
    pub url: String,
    pub title: String,
    pub timestamp: i64,
    pub viewport: ViewportInfo,
}

use crate::domain::{
    ConsoleLogEntry, DebugSnapshot, DomSnapshotResult, DomState, RepositoryError,
    SnapshotRepository, ViewportInfo, WebViewState,
};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Runtime};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum UseCaseError {
    #[error("Window not found: {0}")]
    WindowNotFound(String),
    #[error("Failed to get window property: {0}")]
    WindowProperty(String),
    #[error("Repository error: {0}")]
    Repository(#[from] RepositoryError),
    #[error("System time error: {0}")]
    SystemTime(String),
}

pub struct CaptureWebViewStateUseCase;

impl CaptureWebViewStateUseCase {
    #[tracing::instrument(skip(app))]
    pub fn execute<R: Runtime>(app: &AppHandle<R>) -> Result<WebViewState, UseCaseError> {
        tracing::debug!("Capturing webview state");

        let window = app
            .get_webview_window("main")
            .ok_or_else(|| UseCaseError::WindowNotFound("main".into()))?;

        let url = window
            .url()
            .map_err(|e| UseCaseError::WindowProperty(e.to_string()))?;
        let title = window
            .title()
            .map_err(|e| UseCaseError::WindowProperty(e.to_string()))?;
        let size = window
            .inner_size()
            .map_err(|e| UseCaseError::WindowProperty(format!("Failed to get size: {}", e)))?;

        let state = WebViewState {
            url: url.to_string(),
            title,
            user_agent: "TauriWebView/2.0".to_string(),
            viewport: ViewportInfo {
                width: size.width,
                height: size.height,
            },
        };

        tracing::info!(url = %state.url, title = %state.title, "WebView state captured");

        Ok(state)
    }
}

pub struct SaveDomSnapshotUseCase<R: SnapshotRepository> {
    repository: Arc<R>,
}

impl<R: SnapshotRepository> SaveDomSnapshotUseCase<R> {
    pub fn new(repository: Arc<R>) -> Self {
        Self { repository }
    }

    #[tracing::instrument(skip(self, html))]
    pub fn execute(
        &self,
        html: String,
        url: String,
        title: String,
        viewport_width: u32,
        viewport_height: u32,
    ) -> Result<DomSnapshotResult, UseCaseError> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| UseCaseError::SystemTime(e.to_string()))?
            .as_secs() as i64;

        let dom = DomState {
            html,
            url,
            title,
            viewport: ViewportInfo {
                width: viewport_width,
                height: viewport_height,
            },
            captured_at: timestamp,
        };

        let result = self.repository.save_dom(&dom, timestamp)?;

        tracing::info!(
            path = %result.path.display(),
            "DOM snapshot saved"
        );

        Ok(result)
    }
}

pub struct AppendConsoleLogsUseCase<R: SnapshotRepository> {
    repository: Arc<R>,
}

impl<R: SnapshotRepository> AppendConsoleLogsUseCase<R> {
    pub fn new(repository: Arc<R>) -> Self {
        Self { repository }
    }

    #[tracing::instrument(skip(self, logs))]
    pub fn execute(&self, logs: Vec<ConsoleLogEntry>) -> Result<String, UseCaseError> {
        if logs.is_empty() {
            tracing::debug!("No logs to append");
            return Ok("no logs".to_string());
        }

        tracing::debug!(count = logs.len(), "Appending console logs");

        let path = self.repository.save_console_logs(&logs)?;

        Ok(path.to_string_lossy().into_owned())
    }
}

pub struct CaptureDebugSnapshotUseCase<R: SnapshotRepository> {
    repository: Arc<R>,
}

impl<R: SnapshotRepository> CaptureDebugSnapshotUseCase<R> {
    pub fn new(repository: Arc<R>) -> Self {
        Self { repository }
    }

    #[tracing::instrument(skip(self, app, console_logs))]
    pub fn execute<Rt: Runtime>(
        &self,
        app: &AppHandle<Rt>,
        console_logs: Vec<ConsoleLogEntry>,
        screenshot_path: Option<std::path::PathBuf>,
        dom_snapshot_path: Option<std::path::PathBuf>,
    ) -> Result<DebugSnapshot, UseCaseError> {
        let webview_state = CaptureWebViewStateUseCase::execute(app)?;

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| UseCaseError::SystemTime(e.to_string()))?
            .as_secs() as i64;

        let snapshot = DebugSnapshot {
            timestamp,
            webview_state,
            console_logs,
            screenshot_path,
            dom_snapshot_path,
        };

        let saved_path = self.repository.save_snapshot(&snapshot)?;

        tracing::info!(
            path = %saved_path.display(),
            "Full debug snapshot captured"
        );

        Ok(snapshot)
    }
}

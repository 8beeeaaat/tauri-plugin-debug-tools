use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("Failed to get log directory: {0}")]
    LogDirectory(String),
    #[error("Failed to create directory: {0}")]
    CreateDirectory(#[from] std::io::Error),
}

#[derive(Debug, Clone)]
pub enum LogFormat {
    Json,
    Text,
}

#[derive(Debug, Clone)]
pub struct DebugToolsConfig {
    pub log_dir: PathBuf,
    pub max_log_size_bytes: u64,
    pub log_format: LogFormat,
    pub enable_dom_capture: bool,
    pub enable_rust_logging: bool,
}

impl Default for DebugToolsConfig {
    fn default() -> Self {
        Self {
            log_dir: PathBuf::from("/tmp/tauri-debug-tools"),
            max_log_size_bytes: 50_000,
            log_format: LogFormat::Json,
            enable_dom_capture: true,
            enable_rust_logging: true,
        }
    }
}

impl DebugToolsConfig {
    pub fn from_app_handle<R: Runtime>(app: &AppHandle<R>) -> Result<Self, ConfigError> {
        let log_dir = app
            .path()
            .app_log_dir()
            .map_err(|e| ConfigError::LogDirectory(e.to_string()))?
            .join("debug-tools");

        std::fs::create_dir_all(&log_dir)?;

        Ok(Self {
            log_dir,
            max_log_size_bytes: 50_000,
            log_format: LogFormat::Json,
            enable_dom_capture: true,
            enable_rust_logging: true,
        })
    }

    pub fn frontend_log_path(&self, app_name: &str, pid: u32) -> PathBuf {
        let sanitized_name = app_name.replace(' ', "_");
        self.log_dir
            .join(format!("frontend_console_{}_{}.jsonl", sanitized_name, pid))
    }

    pub fn backend_log_path(&self) -> PathBuf {
        self.log_dir.join("rust_debug.log")
    }

    pub fn screenshot_dir(&self) -> PathBuf {
        self.log_dir.join("screenshots")
    }

    pub fn dom_snapshot_dir(&self) -> PathBuf {
        self.log_dir.join("dom_snapshots")
    }

    pub fn ensure_subdirectories(&self) -> Result<(), ConfigError> {
        std::fs::create_dir_all(self.screenshot_dir())?;
        std::fs::create_dir_all(self.dom_snapshot_dir())?;
        Ok(())
    }
}

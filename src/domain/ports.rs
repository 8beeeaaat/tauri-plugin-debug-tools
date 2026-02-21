use crate::domain::models::{DebugSnapshot, DomSnapshotResult, DomState};
use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum LogError {
    #[error("Failed to initialize logger: {0}")]
    Initialization(String),
    #[error("Failed to write log: {0}")]
    Write(String),
}

#[derive(Debug, Error)]
pub enum RepositoryError {
    #[error("Failed to save: {0}")]
    Save(String),
    #[error("Failed to load: {0}")]
    Load(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[derive(Debug, Error)]
pub enum DomCaptureError {
    #[error("Failed to capture DOM: {0}")]
    Capture(String),
    #[error("Failed to save DOM: {0}")]
    Save(String),
}

pub trait SnapshotRepository: Send + Sync {
    fn save_snapshot(&self, snapshot: &DebugSnapshot) -> Result<PathBuf, RepositoryError>;
    fn save_dom(&self, dom: &DomState, timestamp: i64) -> Result<DomSnapshotResult, RepositoryError>;
    fn save_console_logs(
        &self,
        logs: &[crate::domain::models::ConsoleLogEntry],
    ) -> Result<PathBuf, RepositoryError>;
}

use crate::config::DebugToolsConfig;
use crate::domain::{
    ConsoleLogEntry, DebugSnapshot, DomSnapshotMetadata, DomSnapshotResult, DomState,
    RepositoryError, SnapshotRepository,
};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;

pub struct FileSystemRepository {
    config: Arc<DebugToolsConfig>,
    app_name: String,
    pid: u32,
}

impl FileSystemRepository {
    pub fn new(config: Arc<DebugToolsConfig>, app_name: String) -> Self {
        Self {
            config,
            app_name,
            pid: std::process::id(),
        }
    }

    fn ensure_directories(&self) -> Result<(), RepositoryError> {
        fs::create_dir_all(self.config.screenshot_dir())?;
        fs::create_dir_all(self.config.dom_snapshot_dir())?;
        Ok(())
    }

    pub fn console_log_path(&self) -> PathBuf {
        self.config.frontend_log_path(&self.app_name, self.pid)
    }
}

impl SnapshotRepository for FileSystemRepository {
    fn save_snapshot(&self, snapshot: &DebugSnapshot) -> Result<PathBuf, RepositoryError> {
        self.ensure_directories()?;

        let filename = format!("snapshot_{}.json", snapshot.timestamp);
        let path = self.config.log_dir.join(filename);

        let json = serde_json::to_string_pretty(snapshot)?;
        fs::write(&path, json)?;

        tracing::info!(path = %path.display(), "Debug snapshot saved");

        Ok(path)
    }

    fn save_dom(&self, dom: &DomState, timestamp: i64) -> Result<DomSnapshotResult, RepositoryError> {
        self.ensure_directories()?;

        let filename = format!("dom_{}.html", timestamp);
        let path = self.config.dom_snapshot_dir().join(filename);

        let metadata = DomSnapshotMetadata {
            url: dom.url.clone(),
            title: dom.title.clone(),
            timestamp: dom.captured_at,
            viewport: dom.viewport.clone(),
        };

        let metadata_json = serde_json::to_string_pretty(&metadata)?;
        let full_html = format!(
            "<!--\nDOM Snapshot Metadata:\n{}\n-->\n{}",
            metadata_json, dom.html
        );

        fs::write(&path, full_html)?;

        tracing::info!(path = %path.display(), "DOM snapshot saved");

        Ok(DomSnapshotResult { path, metadata })
    }

    fn save_console_logs(&self, logs: &[ConsoleLogEntry]) -> Result<PathBuf, RepositoryError> {
        if logs.is_empty() {
            return Ok(self.console_log_path());
        }

        let path = self.console_log_path();

        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;

        for entry in logs {
            let line = serde_json::to_string(entry)?;
            writeln!(file, "{}", line)?;
        }

        tracing::debug!(
            path = %path.display(),
            count = logs.len(),
            "Console logs appended"
        );

        Ok(path)
    }
}

pub fn reset_console_logs(config: &DebugToolsConfig, app_name: &str, pid: u32) -> Result<PathBuf, RepositoryError> {
    let path = config.frontend_log_path(app_name, pid);

    fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&path)?;

    tracing::info!(path = %path.display(), "Console logs reset");

    Ok(path)
}

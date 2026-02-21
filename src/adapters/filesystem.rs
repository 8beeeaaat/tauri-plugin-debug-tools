use crate::config::DebugToolsConfig;
use crate::domain::{
    ConsoleLogEntry, DebugSnapshot, DomSnapshotMetadata, DomSnapshotResult, DomState,
    RepositoryError, SnapshotRepository,
};
use std::fs;
use std::io::ErrorKind;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Debug, Default)]
pub struct ClearLogFilesReport {
    pub deleted_paths: Vec<PathBuf>,
    pub truncated_paths: Vec<PathBuf>,
    pub failed_paths: Vec<PathBuf>,
}

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

    fn save_dom(
        &self,
        dom: &DomState,
        timestamp: i64,
    ) -> Result<DomSnapshotResult, RepositoryError> {
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

pub fn reset_console_logs(
    config: &DebugToolsConfig,
    app_name: &str,
    pid: u32,
) -> Result<PathBuf, RepositoryError> {
    let path = config.frontend_log_path(app_name, pid);

    fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&path)?;

    tracing::info!(path = %path.display(), "Console logs reset");

    Ok(path)
}

fn remove_or_truncate(path: &PathBuf) -> Result<bool, RepositoryError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(false),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
        Err(error) if error.kind() == ErrorKind::PermissionDenied => {
            fs::OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(path)?;
            Ok(true)
        }
        Err(error) => Err(RepositoryError::Io(error)),
    }
}

fn clear_directory_files(
    directory: &PathBuf,
    report: &mut ClearLogFilesReport,
) -> Result<(), RepositoryError> {
    if !directory.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        match remove_or_truncate(&path) {
            Ok(true) => report.truncated_paths.push(path),
            Ok(false) => report.deleted_paths.push(path),
            Err(_) => report.failed_paths.push(path),
        }
    }

    Ok(())
}

pub fn clear_debug_log_files(
    config: &DebugToolsConfig,
    app_name: &str,
) -> Result<ClearLogFilesReport, RepositoryError> {
    let mut report = ClearLogFilesReport::default();
    let sanitized_name = app_name.replace(' ', "_");
    let frontend_prefix = format!("frontend_console_{}", sanitized_name);

    if !config.log_dir.exists() {
        return Ok(report);
    }

    for entry in fs::read_dir(&config.log_dir)? {
        let entry = entry?;
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };

        let should_clear_frontend =
            filename.starts_with(&frontend_prefix) && filename.ends_with(".jsonl");
        let should_clear_backend =
            filename == "rust_debug.log" || filename.starts_with("rust_debug.log.");

        if !(should_clear_frontend || should_clear_backend) {
            continue;
        }

        match remove_or_truncate(&path) {
            Ok(true) => report.truncated_paths.push(path),
            Ok(false) => report.deleted_paths.push(path),
            Err(_) => report.failed_paths.push(path),
        }
    }

    clear_directory_files(&config.dom_snapshot_dir(), &mut report)?;
    clear_directory_files(&config.screenshot_dir(), &mut report)?;

    tracing::info!(
        deleted = report.deleted_paths.len(),
        truncated = report.truncated_paths.len(),
        failed = report.failed_paths.len(),
        "Debug log files cleanup finished"
    );

    Ok(report)
}

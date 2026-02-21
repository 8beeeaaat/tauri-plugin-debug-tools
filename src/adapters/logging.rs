use crate::config::DebugToolsConfig;
use crate::domain::LogError;
use std::sync::Arc;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub struct TracingGuard {
    _guard: WorkerGuard,
}

pub fn init_tracing(config: Arc<DebugToolsConfig>) -> Result<TracingGuard, LogError> {
    let log_path = config.backend_log_path();
    let log_dir = log_path
        .parent()
        .ok_or_else(|| LogError::Initialization("Invalid log path".into()))?;

    let file_appender = tracing_appender::rolling::daily(log_dir, "rust_debug.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("tauri_plugin_debug_tools=debug,info"));

    let file_layer = fmt::layer()
        .json()
        .with_writer(non_blocking)
        .with_target(true)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true);

    let stdout_layer = fmt::layer()
        .with_target(true)
        .with_thread_ids(false)
        .with_file(false)
        .with_line_number(false);

    tracing_subscriber::registry()
        .with(env_filter)
        .with(file_layer)
        .with(stdout_layer)
        .try_init()
        .map_err(|e| LogError::Initialization(e.to_string()))?;

    Ok(TracingGuard { _guard: guard })
}

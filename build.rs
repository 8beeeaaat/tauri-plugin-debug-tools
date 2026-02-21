const COMMANDS: &[&str] = &[
    "capture_webview_state",
    "get_console_logs",
    "send_debug_command",
    "append_debug_logs",
    "reset_debug_logs",
    "clear_debug_log_files_command",
    "copy_screenshot_to_debug_dir",
    "write_debug_snapshot",
    "capture_dom_snapshot",
    "capture_full_debug_state",
    "get_log_directory",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}

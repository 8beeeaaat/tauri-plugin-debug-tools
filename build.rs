const COMMANDS: &[&str] = &[
    "capture_webview_state",
    "get_console_logs",
    "send_debug_command",
    "capture_screenshot",
    "append_debug_logs",
    "reset_debug_logs",
    "write_debug_snapshot",
    "auto_capture_debug_snapshot",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}

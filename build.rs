const COMMANDS: &[&str] = &[
    "capture_webview_state",
    "get_console_logs",
    "send_debug_command",
    "append_debug_logs",
    "reset_debug_logs",
    "write_debug_snapshot",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}

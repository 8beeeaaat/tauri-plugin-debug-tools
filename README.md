# tauri-plugin-debug-tools

Comprehensive debug utilities for Tauri WebView applications with AI-powered automated debugging workflows.

## Features

- **WebView State Capture** - Capture URL, title, viewport, and User-Agent
- **Console Log Collection** - Ring-buffer based log collection with batched flushing
- **Screenshot Integration** - System screenshot command integration
- **AI Agent Skill** - Automated debugging workflow for AI agents
- **Debug Snapshots** - Save comprehensive debug state to disk
- **Event-based Communication** - Send debug commands to frontend via Tauri events
- **Smart Log Filtering** - Automatically filters out verbose framework logs (tao TRACE logs)

## Quick Start

### Installation

Add to your Tauri project's `Cargo.toml`:

```toml
[dependencies]
tauri-plugin-debug-tools = "0.1.1"
```

Install the frontend package:

```bash
npm install tauri-plugin-debug-tools
# or
bun add tauri-plugin-debug-tools
```

### Setup

**1. Register the plugin** in your Tauri app:

```rust
// src-tauri/src/main.rs or lib.rs
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_debug_tools::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**2. Configure the plugin (optional)** in your `tauri.conf.json` if you want to override defaults:

```json
{
    "plugins": {
        "debug-tools": {
            "timeout": 30
        }
    }
}
```

If you don't need custom configuration, you can omit this section.

**3. Enable permissions** in `src-tauri/capabilities/default.json`:

```json
{
  "permissions": [
    "debug-tools:default"
  ]
}
```

    **4. Initialize frontend logger** in your app entry point:

```typescript
// src/main.ts or src/App.tsx
import { debugTools } from "tauri-plugin-debug-tools/consoleLogger";

// Use instead of console.*
debugTools.log("Application started");
debugTools.error("Something went wrong");

// Or import individual functions
import { log, error, warn } from "tauri-plugin-debug-tools/consoleLogger";
```

## Usage

### Frontend API

#### Console Logging

```typescript
import { debugTools, consoleLogger } from "tauri-plugin-debug-tools/consoleLogger";

// Log messages (automatically collected)
debugTools.log("Info message");
debugTools.warn("Warning message");
debugTools.error("Error message", { context: "data" });

// Retrieve logs
const allLogs = consoleLogger.getLogs();
const errors = consoleLogger.getErrors();
const recent = consoleLogger.getRecentLogs(50);

// Get statistics
const stats = consoleLogger.getStats();
// { total: 150, byLevel: { log: 100, warn: 30, error: 20, info: 0, debug: 0 } }
```

#### WebView State Inspection

```typescript
import { captureWebViewState } from "tauri-plugin-debug-tools/debugBridge";

const state = await captureWebViewState();
console.log(state);
// {
//   url: "http://localhost:5173",
//   title: "My App",
//   user_agent: "TauriWebView/2.0",
//   viewport: { width: 1200, height: 800 }
// }
```

#### Debug Commands

```typescript
import { sendDebugCommand } from "tauri-plugin-debug-tools/debugBridge";

// Send event-based commands to frontend
await sendDebugCommand("refresh_state", { force: true });
```

#### AI Agent Auto Debugging

```typescript
import { autoCaptureDebugSnapshot } from "tauri-plugin-debug-tools/debugBridge";

// Automatically capture debug snapshot for AI agent
// Includes screenshot, WebView state, and console errors
// Rate-limited to 1 capture per second
try {
  const snapshot = await autoCaptureDebugSnapshot();
  console.log("Screenshot saved to:", snapshot.screenshot_path);
  console.log("Current URL:", snapshot.webview_state.url);
  console.log("Errors found:", snapshot.console_errors);
  console.log("Timestamp:", snapshot.timestamp);
} catch (error) {
  console.error("Failed to capture snapshot:", error);
  // Error example: "Rate limit: Please wait 1 more seconds"
}
```

#### Screenshot Targeting (Important)

`captureMainWindow()` uses the first window returned by the OS screenshot API.
If your app opens multiple windows (or macOS lists system UI first), this can capture
the wrong window or an empty/minimized one. Prefer selecting the target window by
`appName` / `title` and capture by ID.

```typescript
import { invoke } from "@tauri-apps/api/core";

const windows = await invoke<
  { id: number; name: string; title: string; appName: string }[]
>("plugin:screenshots|get_screenshotable_windows");

const target = windows.find(
  (window) => window.appName === "<APP_NAME>" && window.title === "<WINDOW_TITLE>",
);

if (target) {
  const path = await invoke<string>("plugin:screenshots|get_window_screenshot", {
    id: target.id,
  });
  console.log("Screenshot saved:", path);
}
```

You can also pass a matcher directly:

```typescript
import { captureMainWindow } from "tauri-plugin-debug-tools/screenshotHelper";

const path = await captureMainWindow({
  appName: "<APP_NAME>",
  title: "<WINDOW_TITLE>",
});
```

Predicate-based matching is also supported:

```typescript
import { captureMainWindow } from "tauri-plugin-debug-tools/screenshotHelper";

const path = await captureMainWindow({
  predicate: (window) =>
    window.appName === "<APP_NAME>" && window.title.includes("<TITLE_PART>"),
});
```

### Backend Commands

All commands are available through the Tauri IPC system:

| Command | Description | Output |
| ------- | ----------- | ------ |
| `capture_webview_state` | Capture WebView state | `WebViewState` JSON |
| `get_console_logs` | Legacy console logs | Empty array (use frontend logger) |
| `send_debug_command` | Send event to frontend | Success message |
| `append_debug_logs` | Append logs to file | Returns actual file path string |
| `reset_debug_logs` | Clear log file | Returns actual file path string |
| `write_debug_snapshot` | Save debug snapshot | Returns actual file path string |
| `auto_capture_debug_snapshot` | Auto-capture debug snapshot for AI agents | `DebugSnapshotResult` JSON with screenshot, state, errors |

### CLI HTTP Trigger (AI Agent)

Local-only HTTP trigger for agents and CLI tooling.
Enabled automatically in debug builds, or by setting `TAURI_DEBUG_HTTP=1`.
You can change the bind address with `TAURI_DEBUG_HTTP_ADDR` (default `127.0.0.1:39393`).
If the screenshot targets the wrong window, set `TAURI_DEBUG_SCREENSHOT_WINDOW_ID`
to force a specific window ID.

```bash
# Custom bind address
TAURI_DEBUG_HTTP_ADDR=127.0.0.1:40404 curl http://127.0.0.1:40404/health

# Screenshot request
curl http://127.0.0.1:39393/capture_screenshot

# List screenshotable windows
curl http://127.0.0.1:39393/screenshotable_windows

# Force a specific window ID for screenshots
TAURI_DEBUG_SCREENSHOT_WINDOW_ID=12345 \
curl http://127.0.0.1:39393/auto_capture_debug_snapshot

# Health check
curl http://127.0.0.1:39393/health
```

#### Finding Log File Locations

Both `reset_debug_logs` and `append_debug_logs` commands return the actual file path where logs are stored:

```typescript
import { invoke } from '@tauri-apps/api/core';

// Get log file path
const logPath = await invoke('plugin:debug-tools|reset_debug_logs');
console.log('Logs are stored at:', logPath);
// Example output: "/tmp/tauri_console_logs_hoge_12345.jsonl"
```

**Platform-specific locations:**

- **macOS**: `/tmp/tauri_console_logs_[app_name]_[pid].jsonl`
- **Linux**: `/tmp/tauri_console_logs_[app_name]_[pid].jsonl`
- **Windows**: `%TEMP%\tauri_console_logs_[app_name]_[pid].jsonl` (e.g., `C:\Users\...\AppData\Local\Temp\`)

Where `[app_name]` is the application name from `package_info` and `[pid]` is the process ID.

The exact path is determined by Rust's `std::env::temp_dir()` and may vary between systems.

## AI Agent Skill

### Skill Installation

Copy the bundled skill to your agent's skills directory:

(example: Codex)

```bash
cp -R skills/debug-tauri ~/.codex/skills/debug-tauri
```

Or for custom skill directories:

```bash
cp -R skills/debug-tauri /path/to/your/skills/debug-tauri
```

### Skill Usage

Invoke the skill to start automated debugging:

```bash
/debug-tauri
```

The skill will:

1. ✅ Verify the app process is running
2. 📸 Capture a screenshot
3. 📝 Collect console logs (via IPC)
4. 🔍 Analyze visual and runtime state
5. 📄 Generate a comprehensive debug report
6. 💡 Propose fixes based on findings

### Example Report

```markdown
# Tauri Debug Report - 2025-12-31T22:00:00Z

## Screenshot
/tmp/tauri_debug_1735689600.png

## Process Status
- Status: Running
- PID: 12345

## Console Logs
### Recent Errors
- [ERROR] WebGL context lost (timestamp: 1735689550)
- [ERROR] Failed to load texture.png (timestamp: 1735689555)

### Log Statistics
- Total: 1,234 logs
- Errors: 2
- Warnings: 15

## Visual Analysis
### UI State
Main window visible with rendering artifacts in canvas area.

### Recommendations
1. Investigate WebGL context loss - check GPU driver
2. Verify texture.png exists in public/ directory
```

## Architecture

```mermaid
flowchart TB
    subgraph DevEnv["Development Environment"]
        subgraph AIAgent["AI Agent (Codex/Claude Code)"]
            Skill["debug-tauri skill<br/>- Process verification<br/>- Screenshot capture<br/>- Log collection<br/>- Analysis & reporting"]
        end

        subgraph Tauri["Tauri Application"]
            subgraph Frontend["Frontend (TypeScript)"]
                CL["consoleLogger<br/>- Ring buffer (1000 entries)<br/>- Auto flush (1s/200 logs)<br/>- Error handling"]
                DB["debugBridge<br/>- State capture<br/>- Log retrieval<br/>- Debug commands"]
                CL -->|"Logs"| DB
            end

            subgraph Backend["Backend (Rust)"]
                Plugin["tauri-plugin-debug-tools<br/>- capture_webview_state<br/>- append_debug_logs<br/>- reset_debug_logs<br/>- write_debug_snapshot<br/>- send_debug_command"]
            end

            DB -->|"Tauri IPC"| Plugin
            CL -->|"Batch flush"| Plugin
        end

        FS["File System<br/>Temp dir (logs & snapshots)<br/>e.g., /tmp/tauri_console_logs_app_12345.jsonl"]

        Plugin -->|"Write logs & snapshots"| FS
    end

    Skill -->|"1. Verify process"| Tauri
    Skill -->|"2. Invoke IPC commands"| DB
    Skill -->|"3. Read logs & snapshots"| FS
    Skill -->|"4. Capture screenshot"| FS
    FS -->|"5. Analyze & report"| Skill

    style Frontend fill:#e1f5ff
    style Backend fill:#ffe1e1
    style FS fill:#fff4e1
    style AIAgent fill:#f0e1ff
    style Skill fill:#e8d4ff
```

## Log Collection System

The plugin uses a sophisticated ring-buffer based logging system:

- **Buffer Size**: Max 1,000 log entries (automatically drops oldest)
- **Batch Flushing**: Every 1 second or 200 pending logs
- **Auto-initialization**: Starts on module load
- **Error Handling**: Catches global `error` and `unhandledrejection` events
- **Stack Traces**: Automatically captures and normalizes stack traces
- **Zero Config**: No Safari DevTools required

## Development

```bash
# Install dependencies
bun install

# Build TypeScript
npm run build

# Lint
npm run lint

# Format
npm run format
```

## Platform Support

- ✅ macOS (tested)
- ⚠️ Windows (uses system temp directory for logs/snapshots)
- ⚠️ Linux (uses system temp directory for logs/snapshots)

## License

This project is licensed under either of:

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or <http://www.apache.org/licenses/LICENSE-2.0>)
- MIT license ([LICENSE-MIT](LICENSE-MIT) or <http://opensource.org/licenses/MIT>)

at your option.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Related Projects

- [Tauri](https://tauri.app) - Build smaller, faster, and more secure desktop applications
- [Codex](https://github.com/anthropics/anthropic-sdk-typescript) - AI-powered code assistant

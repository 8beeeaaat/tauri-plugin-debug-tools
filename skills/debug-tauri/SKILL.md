---
name: debug-tauri
description: Automates Tauri WebView debugging using official plugins (tauri-plugin-log + screenshots) with process verification, automated screenshots, console logs, and state analysis. Use when debugging Tauri apps, investigating WebView issues, analyzing runtime errors, or troubleshooting UI problems.
---

# Tauri WebView Debugger

Automated debugging workflow for Tauri applications using `tauri-plugin-debug-tools` with official plugin integration.

## Prerequisites

- **tauri-plugin-debug-tools** installed and registered
- **tauri-plugin-log** (v2.0+): Official logging plugin for automatic console collection
- **tauri-plugin-screenshots** (v2.0+): Cross-platform screenshot capture
- Debug permissions enabled: `debug-tools:default`, `log:default`, `screenshots:default`
- Frontend log collection enabled (e.g., `consoleLogger` side-effect import or `logger.initialize()`)

## Autonomous Mode (Default)

When this skill runs, start debugging autonomously and do NOT ask the user for details up front.
Only ask for information if a hard blocker is reached after attempting automatic collection.
Always attempt to collect available evidence first, then ask only for missing blockers.

Autonomous steps (in order):
1. Verify app process if `TAURI_APP_NAME` is set (use `pgrep -x`).
2. Try CLI HTTP trigger if enabled (`TAURI_DEBUG_HTTP=1` or debug build):
   - `curl http://127.0.0.1:39393/health`
   - `curl http://127.0.0.1:39393/capture_screenshot`
   - `curl http://127.0.0.1:39393/screenshotable_windows`
   - `scripts/http_debug.sh snapshot`
3. If the CLI trigger is unavailable, use IPC/TypeScript APIs if the app codebase is in the current repo.
4. If evidence is still missing, ask only for the single missing piece needed to proceed
   (e.g., `TAURI_APP_NAME`, repo path, or confirmation that the app is running).

## Quick Start

### AI Agent One-Shot Debug (Recommended)

Use the integrated debug snapshot API for automatic debugging:

```typescript
import { autoCaptureDebugSnapshot } from "tauri-plugin-debug-tools/debugBridge";

try {
  const snapshot = await autoCaptureDebugSnapshot();
  // Returns: { screenshot_path, webview_state, console_errors, timestamp }
  console.log("Screenshot saved to:", snapshot.screenshot_path);
  console.log("Current URL:", snapshot.webview_state.url);
  console.log("Console errors:", snapshot.console_errors);
  console.log("Timestamp:", snapshot.timestamp);
} catch (error) {
  // Note: Rate limited to 1 capture per second
  console.error("Failed to capture snapshot:", error);
}
```

Benefits:

- ✅ **One API call** captures everything (screenshot + state + errors)
- ✅ **Rate-limited** (1/sec) to prevent excessive captures
- ✅ **Cross-platform** screenshot via tauri-plugin-screenshots
- ✅ **Automatic** console error collection from temp logs
- ✅ **Type-safe** TypeScript interface with full IntelliSense

## Manual Debug Workflow

Copy this checklist to track progress:

```markdown
Debug Progress:
- [ ] Step 1: Verify process status
- [ ] Step 2: Capture screenshot
- [ ] Step 3: Collect console logs
- [ ] Step 4: Capture WebView state
- [ ] Step 5: Analyze findings
- [ ] Step 6: Generate debug report
- [ ] Step 7: Propose fixes
```

### Step 1: Verify Process Status

Check if your Tauri app is running using standard process management tools:

```bash
# Check if app is running
pgrep -x "your-app-name"

# Or use ps
ps aux | grep "your-app-name"
```

### Step 2: Capture Screenshot

**Via Plugin API (Recommended)**:

```typescript
import { captureMainWindow } from "tauri-plugin-debug-tools/screenshotHelper";
const imagePath = await captureMainWindow();
```

**Via IPC (Agent-triggered)**:

```typescript
import { requestScreenshot } from "tauri-plugin-debug-tools/debugBridge";
const result = await requestScreenshot({ source: "agent" });
```

**Via CLI HTTP Trigger (Agent/CLI)**:

Enabled in debug builds or when `TAURI_DEBUG_HTTP=1` is set.
You can override the bind address with `TAURI_DEBUG_HTTP_ADDR` (default `127.0.0.1:39393`).
If the screenshot is incorrect, use `TAURI_DEBUG_SCREENSHOT_WINDOW_ID` with the
window ID from `/screenshotable_windows` to force the target.

```bash
# Auto snapshot (scripts)
scripts/http_debug.sh snapshot

# Other commands (scripts)
scripts/http_debug.sh webview
scripts/http_debug.sh errors
scripts/http_debug.sh reset-logs
scripts/http_debug.sh write-snapshot
scripts/http_debug.sh send-debug refresh_state

# Custom bind address
TAURI_DEBUG_HTTP_ADDR=127.0.0.1:40404 curl http://127.0.0.1:40404/health

# Screenshot request
curl http://127.0.0.1:39393/capture_screenshot

# Window list (for correct targeting)
curl http://127.0.0.1:39393/screenshotable_windows

# Force screenshot target by ID
TAURI_DEBUG_SCREENSHOT_WINDOW_ID=12345 \
curl http://127.0.0.1:39393/auto_capture_debug_snapshot

# Health check
curl http://127.0.0.1:39393/health
```

### Step 3: Collect Console Logs

**Console Logger (Frontend - Recommended)**:

The `consoleLogger` automatically collects frontend logs and errors in a ring buffer and flushes them to a temp file.

```typescript
// Import at app entry point to initialize automatic collection
import "tauri-plugin-debug-tools/consoleLogger";

// Use debugTools for explicit logging
import { debugTools } from "tauri-plugin-debug-tools/consoleLogger";
debugTools.log("App started");
debugTools.error("Something went wrong");
```

**Finding consoleLogger Log Files**:

```typescript
import { invoke } from '@tauri-apps/api/core';

// Get actual log file path
const logPath = await invoke('plugin:debug-tools|reset_debug_logs');
console.log('Console logs stored at:', logPath);
```

**Platform-specific consoleLogger locations**:

- **macOS**: `/tmp/tauri_console_logs_[app_name]_[pid].jsonl`
- **Linux**: `/tmp/tauri_console_logs_[app_name]_[pid].jsonl`
- **Windows**: `%TEMP%\tauri_console_logs_[app_name]_[pid].jsonl`

Where `[app_name]` is the application name and `[pid]` is the process ID.

**Backend Logs (tauri-plugin-log)**:

```typescript
import { logger } from "tauri-plugin-debug-tools/logAdapter";

// Initialize once at app startup
const detach = await logger.initialize();

// Logs auto-forwarded to platform-specific location
logger.info("App started");
logger.error("Something went wrong");
```

**Backend log locations**:

- **macOS**: `~/Library/Logs/{bundle_id}/debug.log`
- **Linux**: `~/.local/share/{bundle_id}/logs/debug.log`
- **Windows**: `{LOCALAPPDATA}\{bundle_id}\logs\debug.log`

**Alternative**: Use debugBridge API. See [IPC_COMMANDS.md](references/IPC_COMMANDS.md#console-log-collection) for all methods.

### Step 4: Capture WebView State

```typescript
import { captureWebViewState } from "tauri-plugin-debug-tools/debugBridge";
const state = await captureWebViewState();
```

Returns: `{ url, title, user_agent, viewport }`

### Step 5: Analyze Findings

- **Visual**: Check screenshot for UI issues, errors, layout problems
- **Logs**: Review errors, warnings, patterns
- **State**: Verify URL, viewport, user agent
- **Performance**: Check for memory leaks, high CPU usage

If no issues are detected, do NOT ask the user for more context.
Conclude with a short status and suggest optional next steps only if relevant.

### Step 6: Generate Debug Report

Use template in [REPORT_TEMPLATE.md](references/REPORT_TEMPLATE.md).

### Step 7: Propose Fixes

Based on collected evidence:

- Identify root cause
- Suggest specific code changes
- Provide implementation steps

## References

**IPC Commands**: [IPC_COMMANDS.md](references/IPC_COMMANDS.md) - Console logs, WebView state, debug commands
**Screenshots**: [SCREENSHOTS.md](references/SCREENSHOTS.md) - Capture methods and troubleshooting
**Troubleshooting**: [TROUBLESHOOTING.md](references/TROUBLESHOOTING.md) - Common errors and solutions
**Report Template**: [REPORT_TEMPLATE.md](references/REPORT_TEMPLATE.md) - Structured debug report format

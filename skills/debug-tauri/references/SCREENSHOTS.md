# Screenshot Capture Reference

## Official Plugin (Recommended)

Use `tauri-plugin-screenshots` for cross-platform screenshot capture.

### Quick Start

```typescript
import { captureMainWindow } from "tauri-plugin-debug-tools/screenshotHelper";

// Capture main window as a file path
const screenshot = await captureMainWindow();
if (screenshot) {
  console.log("Screenshot captured successfully");
}
```

### Available Methods

#### captureMainWindow()

Captures the first matching window (or the first available window if no matcher is provided).

```typescript
import { captureMainWindow } from "tauri-plugin-debug-tools/screenshotHelper";

const imagePath = await captureMainWindow();
```

**Returns**: `string | null` - Screenshot file path or null if no windows

**Note**: The OS window list may include system UI or unrelated apps first.
If you see blank/incorrect screenshots, use a matcher or capture by window ID.

```typescript
import { captureMainWindow } from "tauri-plugin-debug-tools/screenshotHelper";

const imagePath = await captureMainWindow({
  appName: "<APP_NAME>",
  title: "<WINDOW_TITLE>",
});
```

Predicate matching:

```typescript
import { captureMainWindow } from "tauri-plugin-debug-tools/screenshotHelper";

const imagePath = await captureMainWindow({
  predicate: (window) =>
    window.appName === "<APP_NAME>" && window.title.includes("<TITLE_PART>"),
});
```

#### captureAllWindows()

Captures all application windows.

```typescript
import { captureAllWindows } from "tauri-plugin-debug-tools/screenshotHelper";

const screenshots = await captureAllWindows();
```

**Returns**: `string[]` - Array of screenshot file paths

#### capturePrimaryMonitor()

Captures the primary display.

```typescript
import { capturePrimaryMonitor } from "tauri-plugin-debug-tools/screenshotHelper";

const monitorScreenshot = await capturePrimaryMonitor();
```

**Returns**: `string | null` - Screenshot file path or null if no monitors

### Advanced Usage

```typescript
import {
  getScreenshotableWindows,
  getWindowScreenshot,
  getScreenshotableMonitors,
  getMonitorScreenshot,
} from "tauri-plugin-screenshots-api";

// List available windows
const windows = await getScreenshotableWindows();
console.log(windows); // [{ id: 1, title: "My App" }, ...]

// Capture specific window
const screenshot = await getWindowScreenshot(windows[0].id);

// List available monitors
const monitors = await getScreenshotableMonitors();

// Capture specific monitor
const monitorShot = await getMonitorScreenshot(monitors[0].id);
```

### DevTools-Only (No ESM Import)

Some WebView devtools consoles do not support ESM `import`. Use `invoke` directly:

```typescript
const windows = await window.__TAURI__.core.invoke(
  "plugin:screenshots|get_screenshotable_windows",
);

const target = windows.find(
  (window) => window.appName === "<APP_NAME>" && window.title === "<WINDOW_TITLE>",
);

if (target) {
  const path = await window.__TAURI__.core.invoke(
    "plugin:screenshots|get_window_screenshot",
    { id: target.id },
  );
  console.log(path);
}
```

### Platform Support

- ✅ **macOS**: Full support
- ✅ **Windows**: Full support
- ✅ **Linux**: Full support (X11/Wayland)

### Permissions

Add to app capabilities:

```json
{
  "permissions": ["screenshots:default"]
}
```

## Troubleshooting

### Screenshot Is Blank (Black/White/Empty)

**Symptoms**: Captured image is black, white, or shows nothing.

**Common causes**:

- Target window is minimized, hidden, or not in the foreground
- Permissions or window capture restrictions
- Wrong window selected (system window captured instead)

**Recommended checks**:

1. Ensure the app window is visible and in the foreground
2. Confirm permissions include `screenshots:default`
3. Enumerate windows and capture by ID (avoid relying on "first window"):

```bash
curl http://127.0.0.1:39393/screenshotable_windows
```

```typescript
import { getScreenshotableWindows, getWindowScreenshot } from "tauri-plugin-screenshots-api";

const windows = await getScreenshotableWindows();
// Select the correct window id
const screenshot = await getWindowScreenshot(windows[0].id);
```

4. Force the target window ID for HTTP snapshot:

```bash
TAURI_DEBUG_SCREENSHOT_WINDOW_ID=12345 \
curl http://127.0.0.1:39393/auto_capture_debug_snapshot
```

5. As a fallback, capture the primary monitor:

```typescript
import { capturePrimaryMonitor } from "tauri-plugin-debug-tools/screenshotHelper";
const monitorScreenshot = await capturePrimaryMonitor();
```

### Error: Screenshot Not Captured

**Cause**: macOS privacy settings deny screen recording permission.

**Solution:**

1. System Preferences > Security & Privacy > Privacy
2. Select "Screen Recording"
3. Add Terminal (or execution source) to allowed list

### Permission Check

Run validation script:

```bash
scripts/validate_setup.sh
```

This checks screen recording permissions and other debug requirements.

## Legacy: Platform-Specific CLI Tools

**Deprecated**: Use official plugin API for unified cross-platform support.

### Linux (Legacy)

```bash
# Using scrot
scrot /tmp/screenshot.png

# Using gnome-screenshot
gnome-screenshot -f /tmp/screenshot.png
```

### Windows (Legacy)

```powershell
# Using PowerShell
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("{PRTSC}")
```

## References

- [tauri-plugin-screenshots Repository](https://github.com/ayangweb/tauri-plugin-screenshots)

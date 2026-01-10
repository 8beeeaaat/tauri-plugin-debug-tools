import { invoke } from "@tauri-apps/api/core";
import type { ConsoleLogEntry } from "./consoleLogger";

export interface WebViewState {
  url: string;
  title: string;
  user_agent: string;
  viewport: {
    width: number;
    height: number;
  };
}

export interface ConsoleMessage {
  level: string;
  message: string;
  timestamp: number;
}

/**
 * Get WebView state.
 */
export async function captureWebViewState(): Promise<WebViewState> {
  return await invoke<WebViewState>("plugin:debug-tools|capture_webview_state");
}

/**
 * Get console logs (from the frontend logger).
 * This works without opening Safari DevTools.
 */
export function getConsoleLogs(): ConsoleLogEntry[] {
  if (typeof window !== "undefined" && window.__consoleLogger) {
    return window.__consoleLogger.getLogs();
  }
  return [];
}

/**
 * Get error logs only.
 */
export function getConsoleErrors(): ConsoleLogEntry[] {
  if (typeof window !== "undefined" && window.__consoleLogger) {
    return window.__consoleLogger.getErrors();
  }
  return [];
}

/**
 * Get the latest N logs.
 */
export function getRecentConsoleLogs(count = 50): ConsoleLogEntry[] {
  if (typeof window !== "undefined" && window.__consoleLogger) {
    return window.__consoleLogger.getRecentLogs(count);
  }
  return [];
}

/**
 * Get log statistics.
 */
export function getConsoleLogStats() {
  if (typeof window !== "undefined" && window.__consoleLogger) {
    return window.__consoleLogger.getStats();
  }
  return {
    total: 0,
    byLevel: { log: 0, warn: 0, error: 0, info: 0, debug: 0 },
  };
}

/**
 * Clear logs.
 */
export function clearConsoleLogs(): void {
  if (typeof window !== "undefined" && window.__consoleLogger) {
    window.__consoleLogger.clearLogs();
  }
}

/**
 * Send a debug command (event-based).
 * @param command Command name
 * @param payload Payload data
 */
export async function sendDebugCommand(
  command: string,
  payload: Record<string, unknown>,
): Promise<string> {
  return await invoke<string>("plugin:debug-tools|send_debug_command", {
    command,
    payload,
  });
}

/**
 * Request a screenshot from the frontend (agent-triggered).
 */
export async function requestScreenshot(
  payload: Record<string, unknown> = {},
): Promise<string> {
  return await invoke<string>("plugin:debug-tools|capture_screenshot", {
    payload,
  });
}

export interface DebugSnapshotResult {
  screenshot_path: string | null;
  webview_state: WebViewState;
  console_errors: string[];
  timestamp: number;
}

/**
 * Automatically capture a debug snapshot with screenshot for AI agent debugging.
 * This includes screenshot, WebView state, and recent console errors.
 * Rate-limited to prevent excessive captures (1 per second).
 *
 * @returns Debug snapshot with screenshot path, WebView state, and console errors
 * @throws Error if rate limit is exceeded or capture fails
 *
 * @example
 * ```typescript
 * try {
 *   const snapshot = await autoCaptureDebugSnapshot();
 *   console.log("Screenshot saved to:", snapshot.screenshot_path);
 *   console.log("Current URL:", snapshot.webview_state.url);
 *   console.log("Errors found:", snapshot.console_errors);
 * } catch (error) {
 *   console.error("Failed to capture snapshot:", error);
 * }
 * ```
 */
export async function autoCaptureDebugSnapshot(): Promise<DebugSnapshotResult> {
  return await invoke<DebugSnapshotResult>(
    "plugin:debug-tools|auto_capture_debug_snapshot",
  );
}

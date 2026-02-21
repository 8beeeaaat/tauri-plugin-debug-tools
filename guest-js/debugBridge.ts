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

export interface ClearDebugLogsResult {
  deleted_paths: string[];
  truncated_paths: string[];
  failed_paths: string[];
}

export interface CopyScreenshotResult {
  source_path: string;
  destination_path: string;
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
 * Clear frontend/backend debug log files for the current host app.
 */
export async function clearDebugLogFiles(): Promise<ClearDebugLogsResult> {
  return await invoke<ClearDebugLogsResult>(
    "plugin:debug-tools|clear_debug_log_files_command",
  );
}

/**
 * Copy a screenshot file to the debug-tools screenshots directory.
 * @param sourcePath Path to the source screenshot file
 * @returns Source and destination paths
 */
export async function copyScreenshotToDebugDir(
  sourcePath: string,
): Promise<CopyScreenshotResult> {
  return await invoke<CopyScreenshotResult>(
    "plugin:debug-tools|copy_screenshot_to_debug_dir",
    { sourcePath },
  );
}

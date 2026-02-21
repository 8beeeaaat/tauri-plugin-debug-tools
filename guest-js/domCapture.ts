/**
 * DOM Capture utilities for tauri-plugin-debug-tools
 *
 * Provides DOM snapshot capture functionality for AI-powered debugging.
 */

import { invoke } from "@tauri-apps/api/core";

export interface ViewportInfo {
  width: number;
  height: number;
}

export interface DomSnapshotMetadata {
  url: string;
  title: string;
  timestamp: number;
  viewport: ViewportInfo;
}

export interface DomSnapshotResult {
  path: string;
  metadata: DomSnapshotMetadata;
}

export interface LogDirectoryInfo {
  base_dir: string;
  frontend_log: string;
  backend_log: string;
  screenshot_dir: string;
  dom_snapshot_dir: string;
}

/**
 * Capture full DOM as HTML string
 */
export function captureDOMHTML(): string {
  if (typeof document === "undefined") {
    return "";
  }
  return document.documentElement.outerHTML;
}

/**
 * Get current DOM metadata
 */
export function getDOMMetadata(): DomSnapshotMetadata {
  return {
    url: typeof window !== "undefined" ? window.location.href : "",
    title: typeof document !== "undefined" ? document.title : "",
    timestamp: Date.now(),
    viewport: {
      width: typeof window !== "undefined" ? window.innerWidth : 0,
      height: typeof window !== "undefined" ? window.innerHeight : 0,
    },
  };
}

/**
 * Capture and save DOM snapshot to backend
 *
 * @returns Path to saved DOM snapshot file with metadata
 *
 * @example
 * ```typescript
 * const result = await captureDOMSnapshot();
 * console.log(`DOM saved: ${result.path}`);
 * console.log(`URL: ${result.metadata.url}`);
 * ```
 */
export async function captureDOMSnapshot(): Promise<DomSnapshotResult> {
  const html = captureDOMHTML();
  const metadata = getDOMMetadata();

  const result = await invoke<DomSnapshotResult>(
    "plugin:debug-tools|capture_dom_snapshot",
    {
      payload: {
        html,
        url: metadata.url,
        title: metadata.title,
        viewport_width: metadata.viewport.width,
        viewport_height: metadata.viewport.height,
      },
    },
  );

  return result;
}

/**
 * Get unified log directory information
 *
 * @returns Paths to all log directories
 *
 * @example
 * ```typescript
 * const dirs = await getLogDirectory();
 * console.log(`Base dir: ${dirs.base_dir}`);
 * console.log(`Frontend logs: ${dirs.frontend_log}`);
 * console.log(`Rust logs: ${dirs.backend_log}`);
 * ```
 */
export async function getLogDirectory(): Promise<LogDirectoryInfo> {
  return await invoke<LogDirectoryInfo>("plugin:debug-tools|get_log_directory");
}

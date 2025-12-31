/**
 * Screenshot Helper for tauri-plugin-screenshots
 *
 * Provides simplified screenshot capture utilities.
 */

import {
  getMonitorScreenshot,
  getScreenshotableMonitors,
  getScreenshotableWindows,
  getWindowScreenshot,
} from "tauri-plugin-screenshots-api";

/**
 * Capture screenshot of the main (first) window
 *
 * @returns Path to saved screenshot, or null if no windows available
 *
 * @example
 * ```typescript
 * const path = await captureMainWindow();
 * if (path) {
 *   console.log(`Screenshot saved: ${path}`);
 * }
 * ```
 */
export async function captureMainWindow(): Promise<string | null> {
  try {
    const windows = await getScreenshotableWindows();

    if (windows.length === 0) {
      console.warn("No windows available for screenshot");
      return null;
    }

    return await getWindowScreenshot(windows[0].id);
  } catch (error) {
    console.error("Failed to capture main window:", error);
    return null;
  }
}

/**
 * Capture screenshots of all available windows
 *
 * @returns Array of screenshot paths
 *
 * @example
 * ```typescript
 * const paths = await captureAllWindows();
 * console.log(`Captured ${paths.length} screenshots`);
 * ```
 */
export async function captureAllWindows(): Promise<string[]> {
  try {
    const windows = await getScreenshotableWindows();

    const screenshots = await Promise.all(
      windows.map((window: { id: number }) => getWindowScreenshot(window.id)),
    );

    return screenshots;
  } catch (error) {
    console.error("Failed to capture all windows:", error);
    return [];
  }
}

/**
 * Capture screenshot of the primary monitor
 *
 * @returns Path to saved screenshot, or null if no monitors available
 *
 * @example
 * ```typescript
 * const path = await capturePrimaryMonitor();
 * if (path) {
 *   console.log(`Monitor screenshot saved: ${path}`);
 * }
 * ```
 */
export async function capturePrimaryMonitor(): Promise<string | null> {
  try {
    const monitors = await getScreenshotableMonitors();

    if (monitors.length === 0) {
      console.warn("No monitors available for screenshot");
      return null;
    }

    return await getMonitorScreenshot(monitors[0].id);
  } catch (error) {
    console.error("Failed to capture primary monitor:", error);
    return null;
  }
}

/**
 * Get list of all screenshotable windows
 *
 * @returns Array of window information
 */
export async function listWindows() {
  return await getScreenshotableWindows();
}

/**
 * Get list of all screenshotable monitors
 *
 * @returns Array of monitor information
 */
export async function listMonitors() {
  return await getScreenshotableMonitors();
}

// Re-export core functions for advanced usage
export {
  getScreenshotableWindows,
  getWindowScreenshot,
  getScreenshotableMonitors,
  getMonitorScreenshot,
};

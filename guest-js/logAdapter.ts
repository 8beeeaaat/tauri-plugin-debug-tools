/**
 * Log Adapter for tauri-plugin-log
 *
 * Provides a unified interface to the official Tauri logging plugin.
 * Automatically handles console attachment and structured logging.
 */

import {
  attachConsole,
  debug,
  error,
  info,
  trace,
  warn,
} from "@tauri-apps/plugin-log";

export interface Logger {
  trace: typeof trace;
  debug: typeof debug;
  info: typeof info;
  warn: typeof warn;
  error: typeof error;
  initialize: () => Promise<() => void>;
}

/**
 * Official plugin-based logger
 *
 * Usage:
 * ```typescript
 * import { logger } from 'tauri-plugin-debug-tools/logAdapter';
 *
 * // Initialize (call once at app startup)
 * const detach = await logger.initialize();
 *
 * // Use structured logging
 * logger.info('App started');
 * logger.error('Something went wrong');
 *
 * // Cleanup (optional, on app shutdown)
 * detach();
 * ```
 */
export const logger: Logger = {
  trace,
  debug,
  info,
  warn,
  error,

  /**
   * Initialize logging by attaching console.
   *
   * This automatically forwards all console.* calls to the plugin.
   * Returns a detach function to stop console forwarding.
   */
  async initialize() {
    return await attachConsole();
  },
};

export default logger;

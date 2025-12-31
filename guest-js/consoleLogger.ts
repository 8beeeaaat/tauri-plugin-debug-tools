/**
 * Collect error logs without wrapping console methods.
 */

import { invoke } from "@tauri-apps/api/core";

export interface ConsoleLogEntry {
  timestamp: number;
  level: "log" | "warn" | "error" | "info" | "debug";
  message: string;
  args: unknown[];
  stack_trace?: string;
}

class ConsoleLogCollector {
  private logs: ConsoleLogEntry[] = [];
  private readonly maxLogs = 1000; // Max size for the ring buffer.
  private pendingLogs: ConsoleLogEntry[] = [];
  private flushTimer: number | null = null;
  private readonly flushIntervalMs = 1000;
  private readonly maxPendingLogs = 200;
  private tauriReady = false;
  private logsReset = false;
  private readonly originalConsole: {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    info: typeof console.info;
    debug: typeof console.debug;
  };

  constructor() {
    // Preserve original console methods.
    this.originalConsole = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      info: console.info.bind(console),
      debug: console.debug.bind(console),
    };

    this.setupTauriReadyListener();
    this.setupErrorHandlers();
    if (this.isDev()) {
      console.info("[debug] console logger initialized");
    }
  }

  private isDev(): boolean {
    return (
      (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV ===
      true
    );
  }

  private setupErrorHandlers(): void {
    if (typeof window === "undefined") return;

    window.addEventListener("error", (event) => {
      const error = event.error as Error | undefined;
      const message = event.message || error?.message || "Unhandled error";
      const stack = this.normalizeStack(error?.stack);
      this.addLog("error", [message], stack);
    });

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      let message = "Unhandled promise rejection";
      let stack: string | undefined;
      if (reason instanceof Error) {
        message = reason.message;
        stack = reason.stack;
      } else if (typeof reason === "string") {
        message = reason;
      } else if (reason !== undefined) {
        try {
          message = JSON.stringify(reason);
        } catch {
          message = String(reason);
        }
      }
      this.addLog("error", [message, reason], this.normalizeStack(stack));
    });
  }

  private addLog(
    level: ConsoleLogEntry["level"],
    args: unknown[],
    stack_trace?: string,
  ): void {
    const entry: ConsoleLogEntry = {
      timestamp: Date.now(),
      level,
      message: this.formatArgs(args),
      args,
      stack_trace,
    };

    this.logs.push(entry);
    this.enqueuePending(entry);

    // Ring buffer: drop the oldest entries when over the limit.
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  private enqueuePending(entry: ConsoleLogEntry): void {
    this.pendingLogs.push(entry);
    if (this.pendingLogs.length > this.maxPendingLogs) {
      this.pendingLogs.shift();
    }
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (typeof window === "undefined") return;
    if (this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      void this.flushPending();
    }, this.flushIntervalMs);
  }

  private async flushPending(): Promise<void> {
    if (!this.tauriReady) {
      this.scheduleFlush();
      return;
    }
    if (this.pendingLogs.length === 0) return;
    const batch = this.pendingLogs.splice(0, this.pendingLogs.length);
    try {
      await invoke("plugin:debug-tools|append_debug_logs", { logs: batch });
    } catch (error) {
      this.originalConsole.error("[debug] append logs failed", error);
    }
  }

  private setupTauriReadyListener(): void {
    if (typeof window === "undefined") return;
    const tauriCore = (window as Window & { __TAURI__?: { core?: unknown } })
      .__TAURI__?.core;
    if (tauriCore) {
      this.handleTauriReady();
      return;
    }

    window.addEventListener("tauri://ready", () => {
      this.handleTauriReady();
    });
  }

  private handleTauriReady(): void {
    this.tauriReady = true;
    void this.resetLogsFile().finally(() => {
      void this.flushPending();
    });
  }

  private async resetLogsFile(): Promise<void> {
    if (this.logsReset) return;
    this.logsReset = true;
    try {
      await invoke("plugin:debug-tools|reset_debug_logs");
    } catch (error) {
      this.originalConsole.error("[debug] reset logs failed", error);
    }
  }

  private formatArgs(args: unknown[]): string {
    return args
      .map((arg) => {
        if (typeof arg === "string") return arg;
        if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(" ");
  }

  private formatOrigin(stack?: string): string | undefined {
    if (!stack) return undefined;
    const lines = stack
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (line.includes("debugTools")) continue;
      if (line.includes("consoleLogger")) continue;
      if (line.includes("ConsoleLogCollector")) continue;
      if (line.includes("node_modules")) continue;
      if (line.includes("react-dom_client")) continue;
      if (line.includes("guest-js")) continue;
      if (line.includes("dist-js")) continue;
      if (line.startsWith("Error")) continue;
      return line;
    }
    return undefined;
  }

  private buildOrigin(_args: unknown[]): { origin?: string; stack?: string } {
    const error = new Error();
    const stack = error.stack;
    const origin = this.formatOrigin(stack);
    return { origin, stack };
  }

  private withOriginArgs(args: unknown[], origin?: string): unknown[] {
    return origin ? [...args, `[origin] ${origin}`] : args;
  }

  public record(level: ConsoleLogEntry["level"], args: unknown[]): void {
    const { origin, stack } = this.buildOrigin(args);
    const enrichedArgs = this.withOriginArgs(args, origin);
    this.addLog(level, enrichedArgs, this.normalizeStack(stack));
  }

  public log(...args: unknown[]): void {
    const { origin } = this.buildOrigin(args);
    const enrichedArgs = this.withOriginArgs(args, origin);
    this.originalConsole.log(...enrichedArgs);
    this.record("log", args);
  }

  public info(...args: unknown[]): void {
    const { origin } = this.buildOrigin(args);
    const enrichedArgs = this.withOriginArgs(args, origin);
    this.originalConsole.info(...enrichedArgs);
    this.record("info", args);
  }

  public warn(...args: unknown[]): void {
    const { origin } = this.buildOrigin(args);
    const enrichedArgs = this.withOriginArgs(args, origin);
    this.originalConsole.warn(...enrichedArgs);
    this.record("warn", args);
  }

  public error(...args: unknown[]): void {
    const { origin } = this.buildOrigin(args);
    const enrichedArgs = this.withOriginArgs(args, origin);
    this.originalConsole.error(...enrichedArgs);
    this.record("error", args);
  }

  public debug(...args: unknown[]): void {
    const { origin } = this.buildOrigin(args);
    const enrichedArgs = this.withOriginArgs(args, origin);
    this.originalConsole.debug(...enrichedArgs);
    this.record("debug", args);
  }

  private normalizeStack(stack?: string): string | undefined {
    if (!stack) return undefined;
    const cleaned = this.cleanStack(stack);
    return cleaned ?? stack;
  }

  private cleanStack(stack: string): string | null {
    const lines = stack.split("\n");
    if (lines.length <= 1) return null;
    const header = lines[0];
    const filtered = lines
      .slice(1)
      .filter((line) => !line.includes("consoleLogger"))
      .filter((line) => !line.includes("ConsoleLogCollector"));
    if (filtered.length === 0) return null;
    return [header, ...filtered].join("\n");
  }

  /**
   * Get all logs.
   */
  public getLogs(): ConsoleLogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs by level.
   */
  public getLogsByLevel(level: ConsoleLogEntry["level"]): ConsoleLogEntry[] {
    return this.logs.filter((log) => log.level === level);
  }

  /**
   * Get error logs only.
   */
  public getErrors(): ConsoleLogEntry[] {
    return this.getLogsByLevel("error");
  }

  /**
   * Get the latest N logs.
   */
  public getRecentLogs(count: number): ConsoleLogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Clear logs.
   */
  public clearLogs(): void {
    this.logs = [];
  }

  /**
   * Get log statistics.
   */
  public getStats(): {
    total: number;
    byLevel: Record<ConsoleLogEntry["level"], number>;
  } {
    const byLevel: Record<ConsoleLogEntry["level"], number> = {
      log: 0,
      warn: 0,
      error: 0,
      info: 0,
      debug: 0,
    };

    for (const log of this.logs) {
      byLevel[log.level]++;
    }

    return {
      total: this.logs.length,
      byLevel,
    };
  }
}

// Singleton instance.
export const consoleLogger = new ConsoleLogCollector();

export const debugTools = {
  log: (...args: unknown[]) => consoleLogger.log(...args),
  info: (...args: unknown[]) => consoleLogger.info(...args),
  warn: (...args: unknown[]) => consoleLogger.warn(...args),
  error: (...args: unknown[]) => consoleLogger.error(...args),
  debug: (...args: unknown[]) => consoleLogger.debug(...args),
  record: (level: ConsoleLogEntry["level"], args: unknown[]) =>
    consoleLogger.record(level, args),
};

export const log = (...args: unknown[]) => consoleLogger.log(...args);
export const info = (...args: unknown[]) => consoleLogger.info(...args);
export const warn = (...args: unknown[]) => consoleLogger.warn(...args);
export const error = (...args: unknown[]) => consoleLogger.error(...args);
export const debug = (...args: unknown[]) => consoleLogger.debug(...args);
export const record = (level: ConsoleLogEntry["level"], args: unknown[]) =>
  consoleLogger.record(level, args);

// Expose globally so debugBridge can read logs.
if (typeof window !== "undefined") {
  (
    window as Window & { __consoleLogger?: ConsoleLogCollector }
  ).__consoleLogger = consoleLogger;
}

// Global type definition.
declare global {
  interface Window {
    __consoleLogger?: ConsoleLogCollector;
  }
}

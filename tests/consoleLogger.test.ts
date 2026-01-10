import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  consoleLogger,
  debug,
  debugTools,
  error,
  info,
  log,
  record,
  warn,
} from "../guest-js/consoleLogger";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe("consoleLogger", () => {
  beforeEach(() => {
    consoleLogger.clearLogs();
    invokeMock.mockReset();
  });

  it("record adds logs", () => {
    record("info", ["hello"]);
    const logs = consoleLogger.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.level).toBe("info");
    expect(logs[0]?.message).toContain("hello");
  });

  it("ring buffer keeps the latest 1000 entries", () => {
    for (let i = 0; i < 1005; i += 1) {
      record("debug", [`log-${i}`]);
    }
    const logs = consoleLogger.getLogs();
    expect(logs).toHaveLength(1000);
    expect(logs[0]?.message).toContain("log-5");
  });

  it("getStats returns counts by level", () => {
    record("info", ["a"]);
    record("warn", ["b"]);
    record("warn", ["c"]);

    const stats = consoleLogger.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byLevel.info).toBe(1);
    expect(stats.byLevel.warn).toBe(2);
    expect(stats.byLevel.error).toBe(0);
  });

  it("getLogsByLevel and getErrors filter correctly", () => {
    record("info", ["ok"]);
    record("error", ["fail"]);

    const errors = consoleLogger.getErrors();
    const infos = consoleLogger.getLogsByLevel("info");

    expect(errors).toHaveLength(1);
    expect(errors[0]?.level).toBe("error");
    expect(infos).toHaveLength(1);
    expect(infos[0]?.level).toBe("info");
  });

  it("getRecentLogs returns last N logs", () => {
    record("info", ["a"]);
    record("info", ["b"]);
    record("info", ["c"]);

    const recent = consoleLogger.getRecentLogs(2);
    expect(recent).toHaveLength(2);
    expect(recent[0]?.message).toContain("b");
    expect(recent[1]?.message).toContain("c");
  });

  it("clearLogs resets the buffer", () => {
    record("info", ["a"]);
    consoleLogger.clearLogs();
    expect(consoleLogger.getLogs()).toHaveLength(0);
  });

  it("formats non-string arguments", () => {
    record("info", [{ hello: "world" }]);
    const logs = consoleLogger.getLogs();
    expect(logs[0]?.message).toContain("{\"hello\":\"world\"}");
  });

  it("formats Error arguments", () => {
    record("error", [new Error("boom")]);
    const logs = consoleLogger.getLogs();
    expect(logs[0]?.message).toContain("Error: boom");
  });

  it("log helpers record entries", () => {
    consoleLogger.log("one");
    consoleLogger.info("two");
    consoleLogger.warn("three");
    consoleLogger.error("four");
    consoleLogger.debug("five");

    const logs = consoleLogger.getLogs();
    expect(logs).toHaveLength(5);
    expect(logs[0]?.level).toBe("log");
    expect(logs[4]?.level).toBe("debug");
  });

  it("debugTools and exports proxy to consoleLogger", () => {
    const logSpy = vi.spyOn(consoleLogger, "log").mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(consoleLogger, "info").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(consoleLogger, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(consoleLogger, "error").mockImplementation(() => undefined);
    const debugSpy = vi.spyOn(consoleLogger, "debug").mockImplementation(() => undefined);
    const recordSpy = vi
      .spyOn(consoleLogger, "record")
      .mockImplementation(() => undefined);

    debugTools.log("a");
    debugTools.info("b");
    debugTools.warn("c");
    debugTools.error("d");
    debugTools.debug("e");
    debugTools.record("info", ["f"]);

    log("g");
    info("h");
    warn("i");
    error("j");
    debug("k");
    record("info", ["l"]);

    expect(logSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalled();
    expect(recordSpy).toHaveBeenCalled();

    logSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    debugSpy.mockRestore();
    recordSpy.mockRestore();
  });

  it("flushes pending logs when tauri is ready", async () => {
    (globalThis as unknown as { window?: unknown }).window = {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    };
    const logger = consoleLogger as unknown as {
      tauriReady: boolean;
      flushPending: () => Promise<void>;
    };
    logger.tauriReady = true;

    record("info", ["pending"]);

    await logger.flushPending();

    expect(invokeMock).toHaveBeenCalledWith("plugin:debug-tools|append_debug_logs", {
      logs: expect.any(Array),
    });
  });

  it("schedules flush when tauri is not ready", async () => {
    const setTimeoutSpy = vi.fn(() => 1);
    const previousWindow = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window?: unknown }).window = {
      setTimeout: setTimeoutSpy,
      clearTimeout: vi.fn(),
    };

    const logger = consoleLogger as unknown as {
      tauriReady: boolean;
      flushPending: () => Promise<void>;
      flushTimer: number | null;
    };
    logger.tauriReady = false;
    logger.flushTimer = null;

    await logger.flushPending();

    expect(setTimeoutSpy).toHaveBeenCalled();

    (globalThis as unknown as { window?: unknown }).window = previousWindow;
  });

  it("scheduleFlush runs timer callback", () => {
    let callbackCalled = false;
    const setTimeoutSpy = vi.fn((cb: () => void) => {
      cb();
      callbackCalled = true;
      return 1;
    });
    const previousWindow = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window?: unknown }).window = {
      setTimeout: setTimeoutSpy,
      clearTimeout: vi.fn(),
    };

    const logger = consoleLogger as unknown as {
      tauriReady: boolean;
      pendingLogs: unknown[];
      flushTimer: number | null;
      scheduleFlush: () => void;
    };
    logger.tauriReady = true;
    logger.pendingLogs = [];
    logger.flushTimer = null;

    logger.scheduleFlush();

    expect(setTimeoutSpy).toHaveBeenCalled();
    expect(callbackCalled).toBe(true);
    expect(logger.flushTimer).toBe(1);

    (globalThis as unknown as { window?: unknown }).window = previousWindow;
  });

  it("handles append logs failure", async () => {
    invokeMock.mockRejectedValueOnce(new Error("fail"));
    const logger = consoleLogger as unknown as {
      tauriReady: boolean;
      pendingLogs: Array<{ level: string; message: string }>;
      flushPending: () => Promise<void>;
    };
    logger.tauriReady = true;
    logger.pendingLogs = [
      { level: "info", message: "x" } as { level: string; message: string },
    ];

    await logger.flushPending();
  });

  it("resetLogsFile writes the log path once", async () => {
    const logger = consoleLogger as unknown as {
      logsReset: boolean;
      resetLogsFile: () => Promise<void>;
    };
    logger.logsReset = false;

    await logger.resetLogsFile();

    expect(invokeMock).toHaveBeenCalledWith("plugin:debug-tools|reset_debug_logs");
  });

  it("resetLogsFile handles invoke errors", async () => {
    vi.resetModules();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    invokeMock.mockRejectedValueOnce(new Error("fail"));

    const previousWindow = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window?: unknown }).window = {
      addEventListener: vi.fn(),
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    };

    const module = await import("../guest-js/consoleLogger");
    const logger = module.consoleLogger as unknown as {
      logsReset: boolean;
      resetLogsFile: () => Promise<void>;
    };
    logger.logsReset = false;

    await logger.resetLogsFile();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();

    (globalThis as unknown as { window?: unknown }).window = previousWindow;
  });

  it("formatOrigin returns undefined when no usable frame", () => {
    const logger = consoleLogger as unknown as {
      formatOrigin: (stack?: string) => string | undefined;
    };
    const stack = "Error\n    at consoleLogger (consoleLogger.ts:1:1)";
    expect(logger.formatOrigin(stack)).toBeUndefined();
  });

  it("withOriginArgs returns args when origin is missing", () => {
    const logger = consoleLogger as unknown as {
      withOriginArgs: (args: unknown[], origin?: string) => unknown[];
    };
    expect(logger.withOriginArgs(["a"], undefined)).toEqual(["a"]);
  });

  it("normalizeStack handles cleanStack edge cases", () => {
    const logger = consoleLogger as unknown as {
      normalizeStack: (stack?: string) => string | undefined;
    };
    expect(logger.normalizeStack(undefined)).toBeUndefined();

    const singleLine = "Error: boom";
    expect(logger.normalizeStack(singleLine)).toBe(singleLine);

    const filtered = "Error\n    at consoleLogger (x)\n    at ConsoleLogCollector (y)";
    expect(logger.normalizeStack(filtered)).toBe(filtered);

    const normal =
      "Error\n    at doWork (app.ts:1:1)\n    at consoleLogger (x)";
    expect(logger.normalizeStack(normal)).toContain("doWork");
  });

  it("handles error event payloads", async () => {
    vi.resetModules();
    const handlers: Record<string, (event: { error?: Error; message?: string }) => void> =
      {};
    const addEventListener = vi.fn(
      (type: string, callback: (event: { error?: Error; message?: string }) => void) => {
        handlers[type] = callback;
      },
    );
    const previousWindow = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window?: unknown }).window = {
      addEventListener,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    };

    const module = await import("../guest-js/consoleLogger");
    const logger = module.consoleLogger;

    handlers.error?.({ error: new Error("boom") });
    handlers.error?.({ message: "oops" });

    const errors = logger.getErrors();
    expect(errors.length).toBeGreaterThanOrEqual(2);

    (globalThis as unknown as { window?: unknown }).window = previousWindow;
  });

  it("handles unhandledrejection event reasons", async () => {
    vi.resetModules();
    const handlers: Record<string, (event: unknown) => void> = {};
    const addEventListener = vi.fn(
      (type: string, callback: (event: unknown) => void) => {
        handlers[type] = callback;
      },
    );
    const previousWindow = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window?: unknown }).window = {
      addEventListener,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    };

    const module = await import("../guest-js/consoleLogger");
    const logger = module.consoleLogger;

    handlers.unhandledrejection?.({ reason: "fail" });
    handlers.unhandledrejection?.({ reason: new Error("boom") });

    const circular: { self?: unknown } = {};
    circular.self = circular;
    handlers.unhandledrejection?.({ reason: circular });

    const logs = logger.getLogs();
    expect(logs.some((logEntry) => logEntry.message.includes("fail"))).toBe(
      true,
    );
    expect(logs.some((logEntry) => logEntry.message.includes("boom"))).toBe(
      true,
    );
    expect(logs.length).toBeGreaterThanOrEqual(2);

    (globalThis as unknown as { window?: unknown }).window = previousWindow;
  });

  it("handles tauri core ready immediately", async () => {
    vi.resetModules();
    const addEventListener = vi.fn();
    const previousWindow = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window?: unknown }).window = {
      __TAURI__: { core: {} },
      addEventListener,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    };

    await import("../guest-js/consoleLogger");

    expect(addEventListener).not.toHaveBeenCalledWith(
      "tauri://ready",
      expect.any(Function),
    );
    expect(invokeMock).toHaveBeenCalledWith("plugin:debug-tools|reset_debug_logs");

    (globalThis as unknown as { window?: unknown }).window = previousWindow;
  });

  it("registers browser event listeners when window exists", async () => {
    vi.resetModules();
    const handlers: Record<string, () => void> = {};
    const addEventListener = vi.fn((type: string, cb: () => void) => {
      handlers[type] = cb;
    });
    const previousWindow = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window?: unknown }).window = {
      addEventListener,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    };

    const module = await import("../guest-js/consoleLogger");
    expect(
      (globalThis as unknown as { window?: { __consoleLogger?: unknown } })
        .window?.__consoleLogger,
    ).toBe(module.consoleLogger);

    expect(addEventListener).toHaveBeenCalledWith(
      "error",
      expect.any(Function),
    );
    expect(addEventListener).toHaveBeenCalledWith(
      "unhandledrejection",
      expect.any(Function),
    );
    expect(addEventListener).toHaveBeenCalledWith(
      "tauri://ready",
      expect.any(Function),
    );

    handlers["tauri://ready"]?.();

    (globalThis as unknown as { window?: unknown }).window = previousWindow;
  });
});

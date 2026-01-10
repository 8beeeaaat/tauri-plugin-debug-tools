import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  autoCaptureDebugSnapshot,
  captureWebViewState,
  clearConsoleLogs,
  getConsoleErrors,
  getConsoleLogs,
  getConsoleLogStats,
  getRecentConsoleLogs,
  requestScreenshot,
  sendDebugCommand,
} from "../guest-js/debugBridge";
import type { ConsoleLogEntry } from "../guest-js/consoleLogger";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe("debugBridge", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("captureWebViewState invokes the backend", async () => {
    invokeMock.mockResolvedValueOnce({ url: "tauri://" });
    await captureWebViewState();
    expect(invokeMock).toHaveBeenCalledWith(
      "plugin:debug-tools|capture_webview_state",
    );
  });

  it("sendDebugCommand forwards command and payload", async () => {
    invokeMock.mockResolvedValueOnce("ok");
    await sendDebugCommand("ping", { foo: "bar" });
    expect(invokeMock).toHaveBeenCalledWith(
      "plugin:debug-tools|send_debug_command",
      {
        command: "ping",
        payload: { foo: "bar" },
      },
    );
  });

  it("requestScreenshot forwards payload", async () => {
    invokeMock.mockResolvedValueOnce("ok");
    await requestScreenshot({ source: "test" });
    expect(invokeMock).toHaveBeenCalledWith(
      "plugin:debug-tools|capture_screenshot",
      { payload: { source: "test" } },
    );
  });

  it("autoCaptureDebugSnapshot invokes the backend", async () => {
    invokeMock.mockResolvedValueOnce({ screenshot_path: null });
    await autoCaptureDebugSnapshot();
    expect(invokeMock).toHaveBeenCalledWith(
      "plugin:debug-tools|auto_capture_debug_snapshot",
    );
  });

  it("returns console logs when logger is available", () => {
    const previousWindow = (globalThis as unknown as { window?: unknown }).window;
    const logs: ConsoleLogEntry[] = [
      {
        timestamp: 1,
        level: "info",
        message: "hello",
        args: [],
      },
    ];
    (globalThis as unknown as { window?: unknown }).window = {
      __consoleLogger: {
        getLogs: () => logs,
        getErrors: () => logs,
        getRecentLogs: (count: number) => logs.slice(-count),
        getStats: () => ({
          total: 1,
          byLevel: { log: 0, warn: 0, error: 0, info: 1, debug: 0 },
        }),
        clearLogs: vi.fn(),
      },
    };

    expect(getConsoleLogs()).toEqual(logs);
    expect(getConsoleErrors()).toEqual(logs);
    expect(getRecentConsoleLogs(1)).toEqual(logs);
    expect(getConsoleLogStats().total).toBe(1);

    clearConsoleLogs();
    const logger = (
      globalThis as unknown as {
        window?: { __consoleLogger?: { clearLogs: () => void } };
      }
    ).window?.__consoleLogger;
    expect(logger?.clearLogs).toHaveBeenCalledOnce();

    (globalThis as unknown as { window?: unknown }).window = previousWindow;
  });

  it("returns defaults when console logger is unavailable", () => {
    const previousWindow = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window?: unknown }).window = undefined;
    expect(getConsoleLogs()).toEqual([]);
    expect(getConsoleErrors()).toEqual([]);
    expect(getRecentConsoleLogs(5)).toEqual([]);
    expect(getConsoleLogStats()).toEqual({
      total: 0,
      byLevel: { log: 0, warn: 0, error: 0, info: 0, debug: 0 },
    });

    (globalThis as unknown as { window?: unknown }).window = previousWindow;
  });
});

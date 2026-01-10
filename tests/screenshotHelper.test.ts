import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __test__,
  captureAllWindows,
  captureMainWindow,
  capturePrimaryMonitor,
  listMonitors,
  listWindows,
} from "../guest-js/screenshotHelper";

const getScreenshotableWindowsMock = vi.fn();
const getWindowScreenshotMock = vi.fn();
const getScreenshotableMonitorsMock = vi.fn();
const getMonitorScreenshotMock = vi.fn();

vi.mock("tauri-plugin-screenshots-api", () => ({
  getScreenshotableWindows: (...args: unknown[]) =>
    getScreenshotableWindowsMock(...args),
  getWindowScreenshot: (...args: unknown[]) => getWindowScreenshotMock(...args),
  getScreenshotableMonitors: (...args: unknown[]) =>
    getScreenshotableMonitorsMock(...args),
  getMonitorScreenshot: (...args: unknown[]) =>
    getMonitorScreenshotMock(...args),
}));

describe("screenshotHelper", () => {
  beforeEach(() => {
    getScreenshotableWindowsMock.mockReset();
    getWindowScreenshotMock.mockReset();
    getScreenshotableMonitorsMock.mockReset();
    getMonitorScreenshotMock.mockReset();
  });

  it("captureMainWindow returns null when no windows", async () => {
    getScreenshotableWindowsMock.mockResolvedValueOnce([]);
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const result = await captureMainWindow();
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it("captureMainWindow honors predicate match", async () => {
    getScreenshotableWindowsMock.mockResolvedValueOnce([
      { id: 1, appName: "Other", title: "x", name: "x" },
      { id: 2, appName: "MyApp", title: "Main", name: "main" },
    ]);
    getWindowScreenshotMock.mockResolvedValueOnce("/tmp/screen.png");

    const result = await captureMainWindow({
      predicate: (window) => window.appName === "MyApp",
    });

    expect(getWindowScreenshotMock).toHaveBeenCalledWith(2);
    expect(result).toBe("/tmp/screen.png");
  });

  it("captureMainWindow matches by name", async () => {
    getScreenshotableWindowsMock.mockResolvedValueOnce([
      { id: 11, appName: "MyApp", title: "Main", name: "main" },
      { id: 12, appName: "Other", title: "Other", name: "special" },
    ]);
    getWindowScreenshotMock.mockResolvedValueOnce("/tmp/name.png");

    const result = await captureMainWindow({ name: "special" });

    expect(getWindowScreenshotMock).toHaveBeenCalledWith(12);
    expect(result).toBe("/tmp/name.png");
  });

  it("captureMainWindow falls back to field match", async () => {
    getScreenshotableWindowsMock.mockResolvedValueOnce([
      { id: 3, appName: "MyApp", title: "Main", name: "main" },
    ]);
    getWindowScreenshotMock.mockResolvedValueOnce("/tmp/screen2.png");

    const result = await captureMainWindow({ appName: "MyApp", title: "Main" });

    expect(getWindowScreenshotMock).toHaveBeenCalledWith(3);
    expect(result).toBe("/tmp/screen2.png");
  });

  it("captureMainWindow falls back to first window when no match", async () => {
    getScreenshotableWindowsMock.mockResolvedValueOnce([
      { id: 9, appName: "Other", title: "Other", name: "other" },
      { id: 10, appName: "Another", title: "Another", name: "another" },
    ]);
    getWindowScreenshotMock.mockResolvedValueOnce("/tmp/fallback.png");

    const result = await captureMainWindow({ appName: "Missing" });

    expect(getWindowScreenshotMock).toHaveBeenCalledWith(9);
    expect(result).toBe("/tmp/fallback.png");
  });

  it("captureMainWindow returns null when selection fails", async () => {
    getScreenshotableWindowsMock.mockResolvedValueOnce([
      undefined as unknown as { id: number },
    ]);
    const result = await captureMainWindow();
    expect(result).toBeNull();
  });

  it("captureMainWindow returns null on error", async () => {
    getScreenshotableWindowsMock.mockRejectedValueOnce(new Error("boom"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await captureMainWindow();

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it("captureAllWindows returns screenshots", async () => {
    getScreenshotableWindowsMock.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    getWindowScreenshotMock
      .mockResolvedValueOnce("/tmp/a.png")
      .mockResolvedValueOnce("/tmp/b.png");

    const result = await captureAllWindows();

    expect(result).toEqual(["/tmp/a.png", "/tmp/b.png"]);
    expect(getWindowScreenshotMock).toHaveBeenCalledTimes(2);
  });

  it("captureAllWindows returns empty on error", async () => {
    getScreenshotableWindowsMock.mockRejectedValueOnce(new Error("boom"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await captureAllWindows();

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it("capturePrimaryMonitor returns null when no monitors", async () => {
    getScreenshotableMonitorsMock.mockResolvedValueOnce([]);
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const result = await capturePrimaryMonitor();
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it("capturePrimaryMonitor returns screenshot", async () => {
    getScreenshotableMonitorsMock.mockResolvedValueOnce([{ id: 10 }]);
    getMonitorScreenshotMock.mockResolvedValueOnce("/tmp/monitor.png");

    const result = await capturePrimaryMonitor();

    expect(getMonitorScreenshotMock).toHaveBeenCalledWith(10);
    expect(result).toBe("/tmp/monitor.png");
  });

  it("capturePrimaryMonitor returns null on error", async () => {
    getScreenshotableMonitorsMock.mockRejectedValueOnce(new Error("boom"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await capturePrimaryMonitor();

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it("listWindows and listMonitors forward to API", async () => {
    getScreenshotableWindowsMock.mockResolvedValueOnce([{ id: 4 }]);
    getScreenshotableMonitorsMock.mockResolvedValueOnce([{ id: 5 }]);

    await expect(listWindows()).resolves.toEqual([{ id: 4 }]);
    await expect(listMonitors()).resolves.toEqual([{ id: 5 }]);
  });

  it("selectScreenshotWindow handles empty list", () => {
    expect(__test__.selectScreenshotWindow([])).toBeNull();
  });

  it("selectScreenshotWindow prefers predicate match", () => {
    const windows = [
      { id: 1, appName: "a", title: "t", name: "n" },
      { id: 2, appName: "b", title: "t2", name: "n2" },
    ];
    const selected = __test__.selectScreenshotWindow(windows, {
      predicate: (window) => window.appName === "b",
    });
    expect(selected?.id).toBe(2);
  });

  it("selectScreenshotWindow falls through when predicate misses", () => {
    const windows = [
      { id: 1, appName: "a", title: "t", name: "n" },
      { id: 2, appName: "b", title: "t2", name: "n2" },
    ];
    const selected = __test__.selectScreenshotWindow(windows, {
      predicate: (window) => window.appName === "missing",
    });
    expect(selected?.id).toBe(1);
  });

  it("selectScreenshotWindow matches fields or falls back", () => {
    const windows = [
      { id: 3, appName: "x", title: "t3", name: "n3" },
      { id: 4, appName: "y", title: "t4", name: "n4" },
    ];
    const matched = __test__.selectScreenshotWindow(windows, {
      appName: "y",
      title: "t4",
    });
    expect(matched?.id).toBe(4);

    const fallback = __test__.selectScreenshotWindow(windows, {
      appName: "missing",
    });
    expect(fallback?.id).toBe(3);
  });

  it("selectScreenshotWindow returns null when first window is undefined", () => {
    const windows = [undefined as unknown as { id: number }];
    const selected = __test__.selectScreenshotWindow(
      windows as unknown as { id: number }[],
      { appName: "x" },
    );
    expect(selected).toBeNull();
  });
});

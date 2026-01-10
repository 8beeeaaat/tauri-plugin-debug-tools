import { describe, expect, it, vi } from "vitest";

import { logger } from "../guest-js/logAdapter";

const attachConsoleMock = vi.fn(async () => () => undefined);
const traceMock = vi.fn();
const debugMock = vi.fn();
const infoMock = vi.fn();
const warnMock = vi.fn();
const errorMock = vi.fn();

vi.mock("@tauri-apps/plugin-log", () => ({
  attachConsole: (...args: unknown[]) => attachConsoleMock(...args),
  trace: (...args: unknown[]) => traceMock(...args),
  debug: (...args: unknown[]) => debugMock(...args),
  info: (...args: unknown[]) => infoMock(...args),
  warn: (...args: unknown[]) => warnMock(...args),
  error: (...args: unknown[]) => errorMock(...args),
}));

describe("logAdapter", () => {
  it("initialize attaches the console", async () => {
    const detach = await logger.initialize();
    expect(attachConsoleMock).toHaveBeenCalledOnce();
    expect(typeof detach).toBe("function");
  });

  it("logger methods proxy to plugin-log", () => {
    logger.trace("trace");
    logger.debug("debug");
    logger.info("info");
    logger.warn("warn");
    logger.error("error");

    expect(traceMock).toHaveBeenCalledWith("trace");
    expect(debugMock).toHaveBeenCalledWith("debug");
    expect(infoMock).toHaveBeenCalledWith("info");
    expect(warnMock).toHaveBeenCalledWith("warn");
    expect(errorMock).toHaveBeenCalledWith("error");
  });
});

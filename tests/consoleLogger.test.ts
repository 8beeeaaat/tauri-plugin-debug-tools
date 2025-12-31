import { beforeEach, describe, expect, it } from "vitest";

import { consoleLogger, record } from "../guest-js/consoleLogger";

describe("consoleLogger", () => {
  beforeEach(() => {
    consoleLogger.clearLogs();
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
});

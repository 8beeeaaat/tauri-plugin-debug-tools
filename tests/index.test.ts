import { describe, expect, it } from "vitest";

import * as index from "../guest-js/index";

describe("index exports", () => {
  it("re-exports console logger and debug bridge APIs", () => {
    expect(index.consoleLogger).toBeDefined();
    expect(index.debugTools).toBeDefined();
    expect(index.captureWebViewState).toBeDefined();
    expect(index.getConsoleLogs).toBeDefined();
  });
});

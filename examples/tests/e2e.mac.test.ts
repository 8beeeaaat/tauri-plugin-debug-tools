import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Builder, By } from "selenium-webdriver";
import { describe, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const appName = "examples-demo-app";
const appBundlePath = path.join(
  projectRoot,
  "src-tauri",
  "target",
  "debug",
  "bundle",
  "macos",
  `${appName}.app`,
);
const appBundleId =
  process.env.APP_BUNDLE_ID ?? "com.komakisadao.examples-demo-app";

const isMac = process.platform === "darwin";
const serverUrl = process.env.APPIUM_SERVER_URL ?? "http://127.0.0.1:4723";
const dumpSourceEnabled = process.env.MAC2_DUMP_SOURCE === "1";

const suite = isMac ? describe : describe.skip;

suite("Tauri E2E (Appium Mac2)", () => {
  it("launches the app and can access the window", async () => {
    if (!existsSync(appBundlePath)) {
      throw new Error(
        `App bundle not found: ${appBundlePath}\n` +
          "Run `bun run build` first.",
      );
    }

    const driver = await new Builder()
      .usingServer(serverUrl)
      .forBrowser("safari")
      .withCapabilities({
        browserName: "safari",
        platformName: "mac",
        "appium:automationName": "mac2",
        "appium:app": appBundlePath,
        "appium:bundleId": appBundleId,
        "appium:newCommandTimeout": 120,
      })
      .build();

    try {
      const queryAppState = async () => {
        try {
          const state = await driver.executeScript("macos: queryAppState", {
            bundleId: appBundleId,
          });
          return typeof state === "number" ? state : state ? 1 : 0;
        } catch {
          return 0;
        }
      };

      const openApp = () => {
        spawn("open", ["-n", appBundlePath], { stdio: "ignore" });
      };

      const state = await queryAppState();
      if (state === 0) {
        openApp();
      }

      await driver.wait(async () => (await queryAppState()) > 0, 20_000);
      await driver.executeScript("macos: activateApp", {
        bundleId: appBundleId,
      });

      const dumpSource = async (label: string) => {
        if (!dumpSourceEnabled) return;
        try {
          const source = await driver.executeScript("macos: source");
          console.error(`[mac2] ${label} source:\n${source}`);
        } catch (error) {
          console.error(`[mac2] ${label} source failed`, error);
        }
      };

      const waitForLocator = async (
        label: string,
        locator: By,
        timeoutMs = 10_000,
      ) => {
        try {
          return await driver.wait(async () => {
            try {
              return await driver.findElement(locator);
            } catch {
              return false;
            }
          }, timeoutMs);
        } catch (error) {
          await dumpSource(`${label} not found`);
          throw error;
        }
      };

      const waitForSourceIncludes = async (text: string, timeoutMs = 15_000) =>
        await driver.wait(async () => {
          try {
            const source = await driver.executeScript("macos: source");
            return typeof source === "string" && source.includes(text);
          } catch {
            return false;
          }
        }, timeoutMs);

      const byA11y = (value: string) => new By("accessibility id", value);

      await waitForSourceIncludes("Welcome to Tauri");
      await waitForSourceIncludes("greet-input");

      const input = await waitForLocator("input", byA11y("greet-input"));
      if (!input) {
        throw new Error("greet-input not found");
      }
      await input.click();
      await input.sendKeys("Tauri");

      const button = await waitForLocator("button", byA11y("greet-button"));
      if (!button) {
        throw new Error("greet-button not found");
      }
      await button.click();

      await waitForSourceIncludes("Hello, Tauri!", 20_000);

      const capture = await waitForLocator(
        "debug-capture",
        byA11y("debug-capture"),
      );
      if (!capture) {
        throw new Error("debug-capture not found");
      }
      await capture.click();
      await waitForSourceIncludes("debug-webview-output", 20_000);
      await waitForSourceIncludes("Tauri App", 20_000);

      const getLogs = await waitForLocator(
        "debug-get-logs",
        byA11y("debug-get-logs"),
      );
      if (!getLogs) {
        throw new Error("debug-get-logs not found");
      }
      await getLogs.click();
      await waitForSourceIncludes("debug-logs-output", 20_000);

      const sendCommand = await waitForLocator(
        "debug-send-command",
        byA11y("debug-send-command"),
      );
      if (!sendCommand) {
        throw new Error("debug-send-command not found");
      }
      await sendCommand.click();
      await waitForSourceIncludes("debug-command-output", 20_000);
      await waitForSourceIncludes("ping", 20_000);

      const resetLogs = await waitForLocator(
        "debug-reset-logs",
        byA11y("debug-reset-logs"),
      );
      if (!resetLogs) {
        throw new Error("debug-reset-logs not found");
      }
      await resetLogs.click();
      await waitForSourceIncludes("/tmp/tauri_console_logs.jsonl", 20_000);

      const appendLogs = await waitForLocator(
        "debug-append-logs",
        byA11y("debug-append-logs"),
      );
      if (!appendLogs) {
        throw new Error("debug-append-logs not found");
      }
      await appendLogs.click();
      await waitForSourceIncludes("/tmp/tauri_console_logs.jsonl", 20_000);

      const snapshot = await waitForLocator(
        "debug-write-snapshot",
        byA11y("debug-write-snapshot"),
      );
      if (!snapshot) {
        throw new Error("debug-write-snapshot not found");
      }
      await snapshot.click();
      await waitForSourceIncludes("tauri_debug_snapshot_", 20_000);
    } finally {
      await driver.quit();
    }
  }, 120_000);
});

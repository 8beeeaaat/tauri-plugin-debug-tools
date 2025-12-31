import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Builder, By, until, type WebDriver } from "selenium-webdriver";
import { afterAll, beforeAll, describe, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const appDir = path.join(projectRoot, "src-tauri");
const appName = "examples-demo-app";
const binaryName = process.platform === "win32" ? `${appName}.exe` : appName;
const appPath = path.join(appDir, "target", "debug", binaryName);
const isMac = process.platform === "darwin";

const suite = isMac ? describe.skip : describe;

suite("Tauri E2E (tauri-driver)", () => {
  let driver: WebDriver;
  let tauriDriver: ReturnType<typeof spawn> | undefined;

  beforeAll(async () => {
    if (!existsSync(appPath)) {
      throw new Error(`App binary not found: ${appPath}`);
    }

    tauriDriver = spawn(
      "tauri-driver",
      ["--port", "4444", "--native-port", "4445"],
      {
        stdio: "inherit",
      },
    );

    const capabilities = {
      browserName: process.platform === "linux" ? "webkitgtk" : "webview2",
      "tauri:options": {
        application: appPath,
        args: [],
      },
    };

    driver = await new Builder()
      .usingServer("http://127.0.0.1:4444")
      .withCapabilities(capabilities)
      .build();
  }, 60_000);

  afterAll(async () => {
    if (driver) {
      await driver.quit();
    }
    if (tauriDriver && !tauriDriver.killed) {
      tauriDriver.kill("SIGTERM");
    }
  });

  it("shows greet UI", async () => {
    await driver.wait(until.elementLocated(By.css("body")), 10_000);
    const title = await driver.getTitle();
    assert.equal(title, "Tauri App");

    const input = await driver.findElement(By.id("greet-input"));
    await input.clear();
    await input.sendKeys("Tauri");

    const button = await driver.findElement(By.css("button[type='submit']"));
    await button.click();

    const message = await driver.wait(
      until.elementLocated(By.id("greet-msg")),
      5_000,
    );
    await driver.wait(
      until.elementTextContains(message, "Hello, Tauri!"),
      5_000,
    );
  });

  it("debug tools work", async () => {
    const capture = await driver.findElement(By.id("debug-capture"));
    await capture.click();
    const webviewOutput = await driver.findElement(
      By.id("debug-webview-output"),
    );
    await driver.wait(
      until.elementTextContains(webviewOutput, "Tauri App"),
      10_000,
    );

    const getLogs = await driver.findElement(By.id("debug-get-logs"));
    await getLogs.click();
    const logsOutput = await driver.findElement(By.id("debug-logs-output"));
    await driver.wait(until.elementTextContains(logsOutput, "[]"), 10_000);

    const sendCommand = await driver.findElement(By.id("debug-send-command"));
    await sendCommand.click();
    const commandOutput = await driver.findElement(
      By.id("debug-command-output"),
    );
    await driver.wait(until.elementTextContains(commandOutput, "ping"), 10_000);

    const resetLogs = await driver.findElement(By.id("debug-reset-logs"));
    await resetLogs.click();
    await driver.wait(
      until.elementTextContains(logsOutput, "/tmp/tauri_console_logs.jsonl"),
      10_000,
    );

    const appendLogs = await driver.findElement(By.id("debug-append-logs"));
    await appendLogs.click();
    await driver.wait(
      until.elementTextContains(logsOutput, "/tmp/tauri_console_logs.jsonl"),
      10_000,
    );

    const snapshot = await driver.findElement(By.id("debug-write-snapshot"));
    await snapshot.click();
    const snapshotOutput = await driver.findElement(
      By.id("debug-snapshot-output"),
    );
    await driver.wait(
      until.elementTextContains(snapshotOutput, "/tmp/tauri_debug_snapshot_"),
      10_000,
    );
  });
});

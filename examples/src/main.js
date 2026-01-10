const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event ?? {};

let greetInputEl;
let greetMsgEl;
let debugWebviewOutputEl;
let debugLogsOutputEl;
let debugCommandOutputEl;
let debugSnapshotOutputEl;
let debugAutoCaptureOutputEl;
let debugScreenshotOutputEl;

async function greet() {
  // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
  greetMsgEl.textContent = await invoke("greet", { name: greetInputEl.value });
}

window.addEventListener("DOMContentLoaded", () => {
  greetInputEl = document.querySelector("#greet-input");
  greetMsgEl = document.querySelector("#greet-msg");
  document.querySelector("#greet-form").addEventListener("submit", (e) => {
    e.preventDefault();
    greet();
  });

  debugWebviewOutputEl = document.querySelector("#debug-webview-output");
  debugLogsOutputEl = document.querySelector("#debug-logs-output");
  debugCommandOutputEl = document.querySelector("#debug-command-output");
  debugSnapshotOutputEl = document.querySelector("#debug-snapshot-output");
  debugAutoCaptureOutputEl = document.querySelector(
    "#debug-auto-capture-output",
  );
  debugScreenshotOutputEl = document.querySelector("#debug-screenshot-output");

  if (listen) {
    listen("debug-command", (event) => {
      debugCommandOutputEl.textContent = JSON.stringify(event.payload);
    });
  }

  document
    .querySelector("#debug-capture")
    .addEventListener("click", async () => {
      const state = await invoke("plugin:debug-tools|capture_webview_state");
      debugWebviewOutputEl.textContent = JSON.stringify(state);
    });

  document
    .querySelector("#debug-get-logs")
    .addEventListener("click", async () => {
      const logs = await invoke("plugin:debug-tools|get_console_logs");
      debugLogsOutputEl.textContent = JSON.stringify(logs);
    });

  document
    .querySelector("#debug-send-command")
    .addEventListener("click", async () => {
      await invoke("plugin:debug-tools|send_debug_command", {
        command: "ping",
        payload: { ok: true },
      });
    });

  document
    .querySelector("#debug-reset-logs")
    .addEventListener("click", async () => {
      const path = await invoke("plugin:debug-tools|reset_debug_logs");
      debugLogsOutputEl.textContent = String(path);
    });

  document
    .querySelector("#debug-append-logs")
    .addEventListener("click", async () => {
      const payload = [
        {
          timestamp: Date.now(),
          level: "info",
          message: "e2e-log",
          args: ["e2e-log"],
          stack_trace: null,
        },
      ];
      const path = await invoke("plugin:debug-tools|append_debug_logs", {
        logs: payload,
      });
      debugLogsOutputEl.textContent = String(path);
    });

  document
    .querySelector("#debug-write-snapshot")
    .addEventListener("click", async () => {
      const path = await invoke("plugin:debug-tools|write_debug_snapshot", {
        payload: { source: "e2e", ok: true },
      });
      debugSnapshotOutputEl.textContent = String(path);
    });

  document
    .querySelector("#debug-auto-capture")
    .addEventListener("click", async () => {
      const result = await invoke(
        "plugin:debug-tools|auto_capture_debug_snapshot",
      );
      debugAutoCaptureOutputEl.textContent = JSON.stringify(result);
    });

  document
    .querySelector("#debug-screenshot")
    .addEventListener("click", async () => {
      const path = await invoke("plugin:debug-tools|capture_screenshot", {
        payload: { source: "e2e" },
      });
      debugScreenshotOutputEl.textContent = String(path);
    });
});

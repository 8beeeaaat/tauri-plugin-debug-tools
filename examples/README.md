# Tauri + Vanilla

This template should help get you started developing with Tauri in vanilla HTML, CSS and Javascript.

## E2E (macOS)

On macOS, `tauri-driver` is not supported, so E2E runs use Appium + Mac2 Driver.

### Prerequisites

- Xcode installed
- Command Line Tools enabled
- Developer Mode enabled in System Settings
- Terminal / VSCode granted Accessibility and Automation permissions

### Xcode setup

```bash
sudo xcodebuild -runFirstLaunch
sudo xcodebuild -license accept
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

### Install

```bash
npm install -g appium
appium driver install mac2
appium driver list --installed
```

### Run

1. `bun run build`
2. `appium`
3. `bun run e2e`

If needed, override the Appium URL via `APPIUM_SERVER_URL`.

## E2E (Linux/Windows)

On Linux/Windows, use `tauri-driver`.

### Run

1. `bun run build`
2. `bun run e2e`

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

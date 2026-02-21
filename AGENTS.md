# Agent Development Guide

> Guidance for AI agents working with tauri-plugin-debug-tools

## Project Overview

**tauri-plugin-debug-tools** is a Tauri plugin that provides comprehensive debugging utilities for WebView applications. It combines a Rust backend (Tauri plugin) with a TypeScript frontend (log collection and state inspection) and includes an AI-powered debugging skill for AI agents.

## Architecture

### Components

```
tauri-plugin-debug-tools/
├── src/                          # Rust backend (Tauri plugin)
│   ├── lib.rs                    # Plugin initialization
│   └── commands.rs               # Tauri command implementations
├── guest-js/                     # TypeScript frontend
│   ├── consoleLogger.ts          # Log collection system
│   ├── debugBridge.ts            # Backend IPC bridge
│   └── index.ts                  # Public exports
├── skills/debug-tauri/           #  Agent Skill
│   ├── SKILL.md                  # Skill definition
│   ├── references/REFERENCE.md   # Technical reference
│   └── scripts/capture.sh        # Screenshot helper script
├── permissions/                  # Tauri permission schemas
├── build.rs                      # Build script
├── Cargo.toml                    # Rust dependencies
├── package.json                  # TypeScript dependencies
└── tsconfig.json                 # TypeScript configuration
```

### Key Technologies

- **Rust**: Tauri plugin backend (edition 2021)
- **TypeScript**: Frontend utilities (v5.0+)
- **Tauri**: v2.9.5
- **Bun**: Package manager & runtime
- **Biome**: Linting & formatting

## Design Patterns

### 1. Ring Buffer Log Collection

[guest-js/consoleLogger.ts](guest-js/consoleLogger.ts) implements a sophisticated logging system:

- **Ring Buffer**: Max 1,000 entries, auto-drops oldest
- **Batched Flushing**: Every 1s or 200 pending logs
- **Global Error Handling**: Captures `error` and `unhandledrejection` events
- **Stack Trace Normalization**: Filters internal frames
- **Zero Dependencies**: No Safari DevTools required

**Key Design Decision**: Logs are collected in-memory on the frontend and periodically flushed to the host app's log directory (for example, `~/Library/Logs/<bundle-id>/debug-tools/frontend_console_app_name_12345.jsonl` on macOS) via Tauri IPC. This avoids blocking the main thread and provides resilience against IPC failures.

### 2. Event-Based Debug Commands

Debug commands use Tauri's event system for safe, CSP-compliant communication:

```rust
// src/commands.rs
window.emit("debug-command", (command, payload))
```

This approach:

- Preserves Content Security Policy compliance
- Avoids dynamic code execution
- Allows frontend handlers to process commands safely

### 3. Screenshot Integration

Screenshot capture uses `tauri-plugin-screenshots` for cross-platform support. Screenshots are saved to `app_data_dir/tauri-plugin-screenshots/` by that plugin; use `copy_screenshot_to_debug_dir` or the helper `captureMainWindowToDebugDir()` to copy them into `debug-tools/screenshots/` for unified log management.

### 4. Startup Cleanup Scope

`clear_debug_log_files_command` is intended for startup-time reset and currently targets:

- Files under `.../debug-tools/` (for example `frontend_console_*.jsonl`, `rust_debug.log*`)
- `.../debug-tools/dom_snapshots/`
- `.../debug-tools/screenshots/`

When using startup cleanup, host apps should recreate runtime artifacts (for example DOM snapshots) after initialization.

## Common Tasks

### Adding a New Tauri Command

1. **Define the command** in [src/commands.rs](src/commands.rs):

```rust
#[tauri::command]
pub async fn my_new_command<R: Runtime>(
    app: AppHandle<R>,
    param: String,
) -> Result<String, String> {
    // Implementation
    Ok("success".to_string())
}
```

1. **Register the command** in [src/lib.rs](src/lib.rs):

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    commands::my_new_command,
])
```

1. **Add to build script** in [build.rs](build.rs):

```rust
const COMMANDS: &[&str] = &[
    // ... existing commands
    "my_new_command",
];
```

1. **Create TypeScript wrapper** in [guest-js/debugBridge.ts](guest-js/debugBridge.ts):

```typescript
export async function myNewCommand(param: string): Promise<string> {
    return await invoke<string>("plugin:debug-tools|my_new_command", { param });
}
```

1. **Update exports** in [guest-js/index.ts](guest-js/index.ts) if needed.

### Extending Console Logger

To add custom log processing:

1. **Modify [guest-js/consoleLogger.ts](guest-js/consoleLogger.ts)**:

```typescript
class ConsoleLogCollector {
    // Add new method
    public filterByPattern(pattern: RegExp): ConsoleLogEntry[] {
        return this.logs.filter(log => pattern.test(log.message));
    }
}

// Export at bottom
export const filterLogsByPattern = (pattern: RegExp) =>
    consoleLogger.filterByPattern(pattern);
```

1. **Update TypeScript types** if adding new log properties.

### Modifying the Agent Skill

The skill is defined in [skills/debug-tauri/SKILL.md](skills/debug-tauri/SKILL.md):

- **Frontmatter**: Contains skill metadata (name, description)
- **Workflow Section**: Defines the debugging process
- **Debug Report Template**: Standardizes output format

When updating the skill:

1. Modify the workflow steps to match new capabilities
2. Update the debug report template if new data is collected
3. Update [skills/debug-tauri/references/REFERENCE.md](skills/debug-tauri/references/REFERENCE.md) with new command documentation

## Development Workflow

### Building

```bash
# Install dependencies
bun install

# Build TypeScript
npm run build

# This generates:
# - dist/index.js & dist/index.d.ts
# - dist/consoleLogger.js & dist/consoleLogger.d.ts
# - dist/debugBridge.js & dist/debugBridge.d.ts
```

### Linting & Formatting

```bash
# Run all linters
npm run lint

# Check Biome rules
npm run lint:biome

# Check TypeScript types
npm run lint:tsc

# Auto-fix issues
npm run format
```

### Testing the Plugin

Since this is a Tauri plugin, testing requires a host Tauri application:

1. Create a test Tauri app or use an existing one
2. Add the plugin as a dependency:

   ```toml
   [dependencies]
   tauri-plugin-debug-tools = { path = "../tauri-plugin-debug-tools" }
   ```

3. Register the plugin and enable permissions
4. Run `tauri dev` and test IPC commands

## Important Constraints

### Platform-Specific Code

- **Log File Paths**: Determined by Tauri path APIs and host app configuration
- **Screenshot**: Uses macOS `screencapture` command
- **User-Agent**: Hardcoded to `"TauriWebView/2.0"` (TODO: fetch real UA)

For cross-platform support:

```rust
// Resolve from Tauri path APIs (host app aware)
let app_log_dir = app.path().app_log_dir()?;
let log_path = app_log_dir
    .join("debug-tools")
    .join(format!("frontend_console_{}_{}.jsonl", app_name, pid));
```

### Performance Considerations

- **Log Buffer Size**: Limited to 1,000 entries to prevent memory bloat
- **Batch Size**: Max 200 logs per flush to avoid blocking IPC
- **Screenshot**: Delegated to system command (no in-process capture)

### Security Considerations

- **Event-Based Communication**: All commands use Tauri events (no dynamic code execution)
- **CSP Compliant**: No inline scripts or unsafe constructs
- **Sandboxed**: Tauri security model enforced
- **Log Sanitization**: Stack traces are normalized to remove sensitive paths

## Code Style

### Rust

- **Edition**: 2021
- **Style**: Standard Rust formatting (`rustfmt`)
- **Error Handling**: Return `Result<T, String>` from commands
- **Async**: Use `async fn` for all commands

### TypeScript

- **Target**: ES2020+ (module)
- **Strict Mode**: Enabled
- **Formatting**: Biome (configured in [package.json](package.json))
- **Naming**:
  - Functions: `camelCase`
  - Types/Interfaces: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE` (if truly constant)

### Documentation

- **README**: Comprehensive user guide with examples
- **AGENTS.md**: This file - agent development guide
- **SKILL.md**: Skill definition in YAML frontmatter + Markdown body
- **REFERENCE.md**: Technical reference for IPC commands
- **Inline Comments**: Explain "why", not "what"

## Testing Strategy

### Manual Testing Checklist

When making changes, verify:

- [ ] TypeScript builds without errors (`npm run build`)
- [ ] All linters pass (`npm run lint`)
- [ ] Plugin registers in host app without errors
- [ ] IPC commands return expected results
- [ ] Console logger captures logs correctly
- [ ] Logs flush to the path returned by `reset_debug_logs` / `append_debug_logs`
- [ ] Agent skill can be invoked (`/debug-tauri`)
- [ ] Screenshot capture works (macOS)

### Autonomous Verification Loop

When verifying plugin behavior in a host app:

1. Start host app in dev mode
2. Call `plugin:debug-tools|reset_debug_logs` and capture returned path
3. Trigger known frontend log events (`info`, `warn`, `error`)
4. Confirm appended JSONL entries in returned file path
5. Re-run after changes and compare `error` count deltas

### Future: Automated Testing

Consider adding:

- Unit tests for TypeScript utilities (`vitest`)
- Integration tests for Tauri commands (`tauri-driver`)
- E2E tests for the agent skill

## Common Pitfalls

### 1. Window Label Mismatch

The plugin assumes the main window is labeled `"main"`. If your app uses a different label:

```rust
// src/commands.rs - update this
let window = app.get_webview_window("main") // Change to your label
```

### 2. Permission Not Enabled

Users must add `"debug-tools:default"` to their app's capabilities. If commands fail with permission errors, this is likely the cause.

### 3. Tauri Ready Event Timing

The console logger waits for `window.__TAURI__` or `tauri://ready` event before flushing logs. If logs aren't being saved, check that:

- Tauri API is loaded before the logger
- No JavaScript errors prevent the event from firing

### 4. TypeScript Build Not Included

Remember to run `npm run build` before publishing or testing. The `dist/` folder is what gets imported by users.

## Release Checklist

Before releasing a new version:

1. [ ] Update version in [Cargo.toml](Cargo.toml) and [package.json](package.json)
2. [ ] Update [README.md](README.md) with new features
3. [ ] Run `npm run build` and commit `dist/`
4. [ ] Run `npm run lint` (all checks must pass)
5. [ ] Test with a real Tauri app
6. [ ] Update [skills/debug-tauri/SKILL.md](skills/debug-tauri/SKILL.md) if workflow changed
7. [ ] Tag release: `git tag v0.x.0`
8. [ ] Push tag: `git push origin v0.x.0`

## Resources

### Official Documentation

- [Tauri Plugin Development](https://tauri.app/develop/plugins/)
- [Tauri IPC Guide](https://v2.tauri.app/develop/calling-rust/)
- [Claude Code Skills](https://code.claude.com/docs/skills)

### Internal References

- [Technical Reference](skills/debug-tauri/references/REFERENCE.md) - IPC command details
- [Skill Definition](skills/debug-tauri/SKILL.md) - Agent workflow
- [README](README.md) - User documentation

## Support

For questions or issues:

- GitHub Issues: (repository URL)
- Discord: (community link)
- Email: (maintainer email)

---

**Last Updated**: 2025-12-31
**Version**: 0.1.1
**Maintainer**: (your name/team)

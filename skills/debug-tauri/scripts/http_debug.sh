#!/bin/bash
# HTTP debug helper for tauri-plugin-debug-tools
# Usage: ./http_debug.sh <command> [--addr <host:port>] [--out <path>] [--quiet]
#
# Commands:
#   health                Health check
#   screenshot            Trigger screenshot capture
#   webview               Fetch WebView state
#   snapshot              Auto-capture debug snapshot (default)
#   errors                Fetch console errors
#   windows               List screenshotable windows
#   reset-logs            Reset debug log file (returns log path)
#   write-snapshot        Write debug snapshot to temp file (returns path)
#   send-debug <command>  Send debug-command event (payload is empty)

ADDR="${TAURI_DEBUG_HTTP_ADDR:-127.0.0.1:39393}"
OUTPUT_DIR="${TAURI_DEBUG_OUTPUT_DIR:-/tmp}"
QUIET="false"
OUT_PATH=""

function usage() {
  cat <<'USAGE'
Usage: ./http_debug.sh <command> [options]

Commands:
  health
  screenshot
  webview
  snapshot
  errors
  windows
  reset-logs
  write-snapshot
  send-debug <command>

Options:
  --addr <host:port>   Override TAURI_DEBUG_HTTP_ADDR (default: 127.0.0.1:39393)
  --out <path>         Write JSON response to file
  -q, --quiet          Only print output file path when --out is used
  -h, --help           Show this help
USAGE
}

COMMAND="${1:-snapshot}"
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --addr)
      ADDR="${2:-$ADDR}"
      shift 2
      ;;
    --out)
      OUT_PATH="${2:-}"
      shift 2
      ;;
    -q|--quiet)
      QUIET="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      break
      ;;
  esac
done

BASE_URL="$ADDR"
if [[ "$BASE_URL" != http://* && "$BASE_URL" != https://* ]]; then
  BASE_URL="http://$BASE_URL"
fi

function write_output() {
  local response="$1"
  if [ -n "$OUT_PATH" ]; then
    echo "$response" > "$OUT_PATH"
    if [ "$QUIET" = "true" ]; then
      echo "$OUT_PATH"
    else
      echo "✅ Saved: $OUT_PATH"
    fi
  else
    echo "$response"
  fi
}

case "$COMMAND" in
  health)
    write_output "$(curl -sS "$BASE_URL/health")"
    ;;
  screenshot)
    write_output "$(curl -sS "$BASE_URL/capture_screenshot")"
    ;;
  webview)
    if [ -z "$OUT_PATH" ]; then
      OUT_PATH="$OUTPUT_DIR/tauri_webview_state_$(date +%s).json"
    fi
    write_output "$(curl -sS "$BASE_URL/capture_webview_state")"
    ;;
  snapshot)
    if [ -z "$OUT_PATH" ]; then
      OUT_PATH="$OUTPUT_DIR/tauri_debug_snapshot_http_$(date +%s).json"
    fi
    write_output "$(curl -sS "$BASE_URL/auto_capture_debug_snapshot")"
    ;;
  errors)
    if [ -z "$OUT_PATH" ]; then
      OUT_PATH="$OUTPUT_DIR/tauri_console_errors_$(date +%s).json"
    fi
    write_output "$(curl -sS "$BASE_URL/console_errors")"
    ;;
  windows)
    if [ -z "$OUT_PATH" ]; then
      OUT_PATH="$OUTPUT_DIR/tauri_screenshotable_windows_$(date +%s).json"
    fi
    write_output "$(curl -sS "$BASE_URL/screenshotable_windows")"
    ;;
  reset-logs)
    write_output "$(curl -sS "$BASE_URL/reset_debug_logs")"
    ;;
  write-snapshot)
    write_output "$(curl -sS "$BASE_URL/write_debug_snapshot")"
    ;;
  send-debug)
    DEBUG_COMMAND="${1:-}"
    if [ -z "$DEBUG_COMMAND" ]; then
      echo "❌ send-debug requires a command name" >&2
      exit 1
    fi
    write_output "$(curl -sS "$BASE_URL/send_debug_command?command=$DEBUG_COMMAND")"
    ;;
  *)
    echo "❌ Unknown command: $COMMAND" >&2
    usage >&2
    exit 1
    ;;
esac

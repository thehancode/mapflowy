#!/usr/bin/env bash

set -euo pipefail

readonly DEV_HOST="${HOST:-127.0.0.1}"
readonly DEV_PORT="${PORT:-4321}"
readonly DEV_URL="http://${DEV_HOST}:${DEV_PORT}/"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: $0"
  echo "  Starts the Astro development server and opens it in Chrome."
  echo
  echo "Environment overrides:"
  echo "  HOST        Development server host (default: 127.0.0.1)"
  echo "  PORT        Development server port (default: 4321)"
  echo "  CHROME_BIN  Chrome or Chromium executable"
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "Unknown option: $1" >&2
  echo "Usage: $0" >&2
  exit 2
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ -n "${CHROME_BIN:-}" ]]; then
  chrome_bin="$CHROME_BIN"
elif command -v google-chrome >/dev/null 2>&1; then
  chrome_bin="google-chrome"
elif command -v chromium >/dev/null 2>&1; then
  chrome_bin="chromium"
elif command -v chromium-browser >/dev/null 2>&1; then
  chrome_bin="chromium-browser"
else
  echo "Chrome was not found. Set CHROME_BIN to the browser executable." >&2
  exit 1
fi

setsid npm run dev -- --host "$DEV_HOST" --port "$DEV_PORT" &
server_pid=$!

cleanup() {
  if kill -0 "$server_pid" 2>/dev/null; then
    kill -- "-$server_pid"
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

server_ready=false
for _ in {1..80}; do
  if python3 -c "import urllib.request; urllib.request.urlopen('${DEV_URL}', timeout=0.2).close()" 2>/dev/null; then
    server_ready=true
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "The development server failed to start." >&2
    exit 1
  fi
  sleep 0.1
done

if [[ "$server_ready" != true ]]; then
  echo "The development server did not become ready at ${DEV_URL}." >&2
  exit 1
fi

echo "Development server running at ${DEV_URL}"
echo "Source changes rebuild automatically with live reload."
echo "Press Ctrl+C to stop it."
"$chrome_bin" "$DEV_URL" >/dev/null 2>&1 &

wait "$server_pid"

#!/usr/bin/env bash

set -euo pipefail

readonly PREVIEW_PORT="${PORT:-8000}"
readonly PREVIEW_HOST="127.0.0.1"
readonly PREVIEW_URL="http://${PREVIEW_HOST}:${PREVIEW_PORT}/"

build_project=true
for argument in "$@"; do
  case "$argument" in
    --no-build)
      build_project=false
      ;;
    --help|-h)
      echo "Usage: $0 [--no-build]"
      echo "  --no-build  Serve the existing dist directory without rebuilding."
      exit 0
      ;;
    *)
      echo "Unknown option: $argument" >&2
      echo "Usage: $0 [--no-build]" >&2
      exit 2
      ;;
  esac
done

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if "$build_project"; then
  npm run build
elif [[ ! -d dist ]]; then
  echo "The dist directory does not exist. Run without --no-build first." >&2
  exit 1
fi

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

python3 -m http.server "$PREVIEW_PORT" --bind "$PREVIEW_HOST" --directory dist &
server_pid=$!

cleanup() {
  if kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid"
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

for _ in {1..40}; do
  if python3 -c "import urllib.request; urllib.request.urlopen('${PREVIEW_URL}', timeout=0.2).close()" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

if ! kill -0 "$server_pid" 2>/dev/null; then
  echo "The preview server failed to start." >&2
  exit 1
fi

echo "Preview running at ${PREVIEW_URL}"
echo "Press Ctrl+C to stop it."
"$chrome_bin" "$PREVIEW_URL" >/dev/null 2>&1 &

wait "$server_pid"

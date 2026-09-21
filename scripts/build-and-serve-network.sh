#!/usr/bin/env bash

set -euo pipefail

readonly SERVER_HOST="0.0.0.0"
readonly SERVER_PORT="${PORT:-8000}"
readonly LOCAL_URL="http://127.0.0.1:${SERVER_PORT}/"

build_project=true
for argument in "$@"; do
  case "$argument" in
    --no-build)
      build_project=false
      ;;
    --help|-h)
      echo "Usage: $0 [--no-build]"
      echo "  --no-build  Serve the existing dist directory without rebuilding."
      echo "  PORT=8080  Use a different port (default: 8000)."
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

network_ip=""
if command -v ip >/dev/null 2>&1; then
  network_ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }')"
fi
if [[ -z "$network_ip" ]] && command -v hostname >/dev/null 2>&1; then
  network_ip="$(hostname -I 2>/dev/null | awk '{ print $1 }')"
fi

python3 -m http.server "$SERVER_PORT" --bind "$SERVER_HOST" --directory dist &
server_pid=$!

cleanup() {
  if kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid"
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

for _ in {1..40}; do
  if python3 -c "import urllib.request; urllib.request.urlopen('${LOCAL_URL}', timeout=0.2).close()" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

if ! kill -0 "$server_pid" 2>/dev/null; then
  echo "The network preview server failed to start." >&2
  exit 1
fi

echo
echo "Mapflowy is available while this terminal stays open."
echo "This computer: ${LOCAL_URL}"
if [[ -n "$network_ip" ]]; then
  echo "Phone (same Wi-Fi): http://${network_ip}:${SERVER_PORT}/"
else
  echo "Could not detect this computer's network IP. Run: hostname -I"
fi
echo "Press Ctrl+C to stop the server."

wait "$server_pid"

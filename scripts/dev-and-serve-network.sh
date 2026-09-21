#!/usr/bin/env bash

set -euo pipefail

readonly SERVER_HOST="0.0.0.0"
readonly SERVER_PORT="${PORT:-4321}"
readonly LOCAL_URL="http://127.0.0.1:${SERVER_PORT}/"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: $0"
  echo "  Starts the Astro development server with live reload on the local network."
  echo "  PORT=8080  Use a different port (default: 4321)."
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "Unknown option: $1" >&2
  echo "Usage: $0" >&2
  exit 2
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."

network_ip=""
if command -v ip >/dev/null 2>&1; then
  network_ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }' || true)"
fi
if [[ -z "$network_ip" ]] && command -v hostname >/dev/null 2>&1; then
  network_ip="$(hostname -I 2>/dev/null | awk '{ print $1 }' || true)"
fi

setsid npm run dev -- --host "$SERVER_HOST" --port "$SERVER_PORT" &
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
  if python3 -c "import urllib.request; urllib.request.urlopen('${LOCAL_URL}', timeout=0.2).close()" 2>/dev/null; then
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
  echo "The development server did not become ready at ${LOCAL_URL}." >&2
  exit 1
fi

echo
echo "Mapflowy development server is available while this terminal stays open."
echo "Source changes update automatically with live reload."
echo "This computer: ${LOCAL_URL}"
if [[ -n "$network_ip" ]]; then
  echo "Phone (same Wi-Fi): http://${network_ip}:${SERVER_PORT}/"
else
  echo "Could not detect this computer's network IP. Run: hostname -I"
fi
echo "Press Ctrl+C to stop the server."

wait "$server_pid"

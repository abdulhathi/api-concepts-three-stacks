#!/usr/bin/env bash
# Starts one stack's server, runs the contract suite against it, and stops the server.
# Usage: ./run.sh python|node|dotnet [vitest args, e.g. -t "20 ·"]   (install each stack's dependencies first; see its README)
set -euo pipefail

stack="${1:?usage: ./run.sh python|node|dotnet}"
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"

# Fast webhook retries keep the suite quick; everything else uses the spec's defaults.
export WEBHOOK_RETRY_BASE_MS=100

# Its own port (18001, 18002, 18003 by default), so it never talks to a dev server already running on 8001-8003.
offset="${CONTRACT_PORT_OFFSET:-10000}"

case "$stack" in
  python) port=$((8001 + offset)); dir="$root/python-fastapi-aws"; build=(true)
    cmd=(.venv/bin/python -m app) ;;
  node) port=$((8002 + offset)); dir="$root/node-typescript-gcp"; build=(npm run build --silent)
    cmd=(node dist/index.js) ;;
  dotnet) port=$((8003 + offset)); dir="$root/dotnet-azure"; build=(dotnet build src/ApiConcepts.Api -c Release --nologo -v quiet)
    cmd=(dotnet src/ApiConcepts.Api/bin/Release/net9.0/ApiConcepts.Api.dll) ;;
  *) echo "unknown stack: $stack" >&2; exit 2 ;;
esac

(cd "$dir" && "${build[@]}")

log="$(mktemp)"
(cd "$dir" && PORT="$port" exec "${cmd[@]}") >"$log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true' EXIT

for _ in $(seq 1 120); do
  if curl -fsS "http://127.0.0.1:$port/health" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$server" 2>/dev/null; then echo "server exited:" >&2; cat "$log" >&2; exit 1; fi
  sleep 0.5
done
curl -fsS "http://127.0.0.1:$port/health" >/dev/null || { echo "server never became healthy:" >&2; cat "$log" >&2; exit 1; }

cd "$here"
API_URL="http://127.0.0.1:$port" npx vitest run "${@:2}"

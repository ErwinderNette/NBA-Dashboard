#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-3001}"
BACKEND_DIR="go-backend"

if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Backend already running on port ${PORT}. Reusing existing process."
  lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN
  exit 0
fi

echo "Starting backend on port ${PORT}..."
cd "${BACKEND_DIR}"
exec go run cmd/main.go

#!/usr/bin/env bash
set -euo pipefail

PROD_HOST="${PROD_HOST:-nba.uppr.de}"

echo "Checking production health endpoints..."
curl -fsS "https://${PROD_HOST}/health" >/dev/null
curl -fsS "https://${PROD_HOST}/ready" >/dev/null

echo "Smoke tests passed."

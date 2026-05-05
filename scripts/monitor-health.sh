#!/usr/bin/env bash
set -euo pipefail

PROD_HOST="${PROD_HOST:-nba.uppr.de}"
ALERT_EMAIL="${ALERT_EMAIL:-}"

check_endpoint() {
  local url="$1"
  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" "${url}" || true)"
  if [[ "${code}" != "200" ]]; then
    echo "Health check failed: ${url} (status=${code})"
    if [[ -n "${ALERT_EMAIL}" ]]; then
      echo "Health check failed: ${url} (status=${code})" | mail -s "NBA Prod Health Alert" "${ALERT_EMAIL}" || true
    fi
    exit 1
  fi
}

check_endpoint "https://${PROD_HOST}/health"
check_endpoint "https://${PROD_HOST}/ready"
echo "Health checks OK for ${PROD_HOST}"

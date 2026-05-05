#!/usr/bin/env bash
set -euo pipefail

if ! command -v podman >/dev/null 2>&1; then
  echo "podman ist nicht installiert."
  exit 1
fi

TARGET_ENV="${TARGET_ENV:-prod}"

upsert_secret() {
  local name="$1"
  local prompt="$2"
  local value

  read -r -s -p "${prompt}: " value
  echo

  if [[ -z "${value}" ]]; then
    echo "Secret ${name} uebersprungen (leer)."
    return 0
  fi

  if podman secret exists "${name}" 2>/dev/null; then
    podman secret rm "${name}" >/dev/null
  fi

  printf '%s' "${value}" | podman secret create "${name}" - >/dev/null
  echo "Secret ${name} gesetzt."
}

if [[ "${TARGET_ENV}" == "all" ]]; then
  echo "Lege Podman-Secrets fuer STAGING an"
  upsert_secret "jwt_secret_staging" "JWT Secret (staging)"
  upsert_secret "db_password_staging" "DB Passwort (staging)"
  upsert_secret "network_api_token_staging" "Network API Token (staging)"
fi

echo "Lege Podman-Secrets fuer PROD an"
upsert_secret "jwt_secret_prod" "JWT Secret (prod)"
upsert_secret "db_password_prod" "DB Passwort (prod)"
upsert_secret "network_api_token_prod" "Network API Token (prod)"

echo "Fertig. Pruefen mit: podman secret ls"

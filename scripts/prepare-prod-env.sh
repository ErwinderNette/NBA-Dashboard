#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$HOME/app}"
TARGET_FILE="${ROOT_DIR}/prod.env"
TEMPLATE_FILE="${ROOT_DIR}/prod.env.example"

if [[ ! -f "${TEMPLATE_FILE}" ]]; then
  echo "Template fehlt: ${TEMPLATE_FILE}"
  exit 1
fi

if [[ -f "${TARGET_FILE}" ]]; then
  echo "prod.env existiert bereits: ${TARGET_FILE}"
  exit 0
fi

cp "${TEMPLATE_FILE}" "${TARGET_FILE}"
chmod 600 "${TARGET_FILE}"
echo "prod.env angelegt: ${TARGET_FILE}"
echo "Bitte alle Platzhalterwerte vor Deploy ersetzen."

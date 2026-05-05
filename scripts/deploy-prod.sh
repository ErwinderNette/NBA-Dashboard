#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$HOME/app}"

cd "${ROOT_DIR}"

if [[ ! -f prod.env ]]; then
  echo "prod.env fehlt in ${ROOT_DIR}."
  exit 1
fi

if ! command -v podman >/dev/null 2>&1; then
  echo "podman ist nicht installiert."
  exit 1
fi

echo "Deploying Traefik + production stack..."
podman compose -f compose.traefik.yml up -d
podman compose -f compose.prod.yml pull
podman compose -f compose.prod.yml up -d

echo "Service status:"
podman ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

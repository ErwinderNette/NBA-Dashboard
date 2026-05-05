#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups}"
ENVIRONMENT="${ENVIRONMENT:-prod}"
PG_CONTAINER="${PG_CONTAINER:-postgres-${ENVIRONMENT}}"
DB_NAME="${DB_NAME:-nba_dashboard}"
DB_USER="${DB_USER:-nba_user}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-uploads-${ENVIRONMENT}}"
STORAGE_BOX_TARGET="${STORAGE_BOX_TARGET:-}"
RETENTION_LOCAL_DAYS="${RETENTION_LOCAL_DAYS:-30}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
workdir="${BACKUP_ROOT}/${ENVIRONMENT}/${timestamp}"
mkdir -p "${workdir}"

echo "Creating PostgreSQL dump from ${PG_CONTAINER}..."
podman exec "${PG_CONTAINER}" pg_dump -U "${DB_USER}" "${DB_NAME}" > "${workdir}/db.sql"
gzip -f "${workdir}/db.sql"

echo "Backing up uploads volume ${UPLOADS_VOLUME}..."
podman run --rm \
  -v "${UPLOADS_VOLUME}:/source:ro" \
  -v "${workdir}:/backup" \
  alpine:3.20 sh -c 'tar -czf /backup/uploads.tar.gz -C /source .'

if [[ -n "${STORAGE_BOX_TARGET}" ]]; then
  echo "Sync to remote storage target ${STORAGE_BOX_TARGET}..."
  rsync -az --delete "${BACKUP_ROOT}/${ENVIRONMENT}/" "${STORAGE_BOX_TARGET}/"
fi

echo "Pruning local backups older than ${RETENTION_LOCAL_DAYS} days..."
find "${BACKUP_ROOT}/${ENVIRONMENT}" -mindepth 1 -maxdepth 1 -type d -mtime +"${RETENTION_LOCAL_DAYS}" -exec rm -rf {} +

echo "Backup finished: ${workdir}"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.control-plane.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.generated/multinode/control-plane.env}"

if [[ "${1:-}" != "--confirm-destructive-restore" || -z "${2:-}" ]]; then
  echo "Usage: $0 --confirm-destructive-restore <s3-object-key>" >&2
  exit 64
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing control-plane environment file: $ENV_FILE" >&2
  exit 1
fi

object_key="$2"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
: "${AWS_REGION:?AWS_REGION is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"

tmp_file="$(mktemp "${TMPDIR:-/tmp}/oneclick-postgres-restore.XXXXXX.dump")"
trap 'rm -f "$tmp_file"' EXIT

aws s3 cp "s3://${BACKUP_BUCKET}/${object_key}" "$tmp_file" --region "$AWS_REGION" --only-show-errors
test -s "$tmp_file"

cd "$ROOT_DIR"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db \
  pg_restore --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB" <"$tmp_file"

echo "PostgreSQL restore completed from s3://${BACKUP_BUCKET}/${object_key}"

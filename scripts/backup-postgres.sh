#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.control-plane.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.generated/multinode/control-plane.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing control-plane environment file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
: "${AWS_REGION:?AWS_REGION is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"

report_failure() {
  local status="$1"
  if [[ "$status" -ne 0 ]]; then
    aws cloudwatch put-metric-data --region "$AWS_REGION" --namespace OneClickHost --metric-data \
      "MetricName=BackupFailure,Value=1,Dimensions=Role=control-plane" --no-cli-pager >/dev/null 2>&1 || true
  fi
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
object_key="postgres/${POSTGRES_DB}-${timestamp}.dump"
tmp_file="$(mktemp "${TMPDIR:-/tmp}/oneclick-postgres-${timestamp}.XXXXXX.dump")"
trap 'status=$?; report_failure "$status"; rm -f "$tmp_file"; exit "$status"' EXIT

cd "$ROOT_DIR"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db \
  sh -lc 'pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' >"$tmp_file"

test -s "$tmp_file"
aws s3 cp "$tmp_file" "s3://${BACKUP_BUCKET}/${object_key}" \
  --region "$AWS_REGION" \
  --sse AES256 \
  --only-show-errors

echo "PostgreSQL backup uploaded: s3://${BACKUP_BUCKET}/${object_key}"

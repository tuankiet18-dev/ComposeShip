#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.control-plane.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.generated/multinode/control-plane.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing control-plane environment file: $ENV_FILE" >&2
  exit 1
fi

cd "$ROOT_DIR"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d db
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm --no-deps api --migrate

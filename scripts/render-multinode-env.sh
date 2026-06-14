#!/usr/bin/env bash
set -euo pipefail

output_dir="${OUTPUT_DIR:-.generated/multinode}"
secrets_file="${SECRETS_FILE:-.generated/multinode-secrets.env}"

usage() {
  cat <<'EOF'
Usage:
  CONTROL_PLANE_PUBLIC_IP=1.2.3.4 \
  CONTROL_PLANE_PRIVATE_IP=10.0.1.10 \
  ./scripts/render-multinode-env.sh

Optional:
  OUTPUT_DIR=.generated/multinode
  SECRETS_FILE=.generated/multinode-secrets.env
  ADMIN_CORS_ORIGIN=http://1.2.3.4.sslip.io
  CONTROL_PLANE_API_BIND=10.0.1.10
  CONTROL_PLANE_API_HOST=10.0.1.10
  CONTROL_PLANE_POSTGRES_PASSWORD=existing-local-password
  EXECUTION_NODE_PRIVATE_IP=10.0.1.20

This renders:
  .generated/multinode/control-plane.env
  .generated/multinode/execution-node.env when EXECUTION_NODE_PRIVATE_IP is set
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ ! -f "$secrets_file" ]]; then
  ./scripts/generate-execution-secrets.sh "$secrets_file"
fi

set -a
# shellcheck disable=SC1090
source "$secrets_file"
set +a

: "${CONTROL_PLANE_PUBLIC_IP:?CONTROL_PLANE_PUBLIC_IP is required}"

control_plane_private_ip="${CONTROL_PLANE_PRIVATE_IP:-$CONTROL_PLANE_PUBLIC_IP}"
control_plane_api_bind="${CONTROL_PLANE_API_BIND:-$control_plane_private_ip}"
control_plane_api_host="${CONTROL_PLANE_API_HOST:-$control_plane_private_ip}"
control_plane_postgres_password="${CONTROL_PLANE_POSTGRES_PASSWORD:-$POSTGRES_PASSWORD}"
traefik_domain="${CONTROL_PLANE_PUBLIC_IP}.sslip.io"
admin_cors_origin="${ADMIN_CORS_ORIGIN:-http://${traefik_domain}}"

mkdir -p "$output_dir"

cat >"${output_dir}/control-plane.env" <<EOF
# Generated control-plane env for OneClickHost multi-node phase one.
ASPNETCORE_ENVIRONMENT=Production
POSTGRES_DB=oneclickhost
POSTGRES_USER=oneclick
POSTGRES_PASSWORD=${control_plane_postgres_password}
CONNECTION_STRING=Host=db;Port=5432;Database=oneclickhost;Username=oneclick;Password=${control_plane_postgres_password}
JWT_SECRET=${JWT_SECRET}
ONECLICK_SECRET_KEY=${ONECLICK_SECRET_KEY}
JWT_ISSUER=oneclick-host
JWT_AUDIENCE=oneclick-host-client
JWT_EXPIRY_HOURS=24
CORS_ORIGINS=${admin_cors_origin}
TRAEFIK_DOMAIN=${traefik_domain}
VITE_API_URL=http://${traefik_domain}/api
API_BIND=${control_plane_api_bind}
POSTGRES_BIND=127.0.0.1
FRONTEND_BIND=127.0.0.1
EXECUTION_NODE_REGISTRATION_TOKEN=${EXECUTION_NODE_REGISTRATION_TOKEN}
EXECUTION_NODE_LEASE_TIMEOUT_SECONDS=120
EXECUTION_NODE_MAX_LEASE_RETRIES=3
EXECUTION_NODE_RETRY_DELAY_SECONDS=30
LOG_MAX_BYTES=200000
AUTO_MIGRATE_DATABASE=true
WORKER_MODE=dispatcher
EOF

if [[ -n "${EXECUTION_NODE_PRIVATE_IP:-}" ]]; then
  cat >"${output_dir}/execution-node.env" <<EOF
# Generated execution-node env for OneClickHost multi-node phase one.
COMPOSE_PROJECT_NAME=oneclick-execution
WORKER_MODE=executor
CONTROL_PLANE_API_URL=http://${control_plane_api_host}:5000/api
EXECUTION_NODE_NAME=execution-node-1
EXECUTION_NODE_TOKEN=${EXECUTION_NODE_TOKEN}
EXECUTION_NODE_REGISTRATION_TOKEN=${EXECUTION_NODE_REGISTRATION_TOKEN}
EXECUTION_NODE_PRIVATE_HOST=${EXECUTION_NODE_PRIVATE_IP}
EXECUTION_NODE_BIND_HOST=0.0.0.0
EXECUTION_NODE_ARCHITECTURE=unknown
EXECUTION_NODE_LABELS=private-network,phase-one
TRAEFIK_DOMAIN=${traefik_domain}
WORKER_POLL_INTERVAL=5
WORKER_BUILD_TIMEOUT=900
MAX_CONCURRENT_BUILDS=1
CONTAINER_MEMORY_LIMIT=256m
CONTAINER_CPU_LIMIT=0.5
CONTAINER_PIDS_LIMIT=256
LOG_MAX_BYTES=200000
EOF
  chmod 600 "${output_dir}/execution-node.env" 2>/dev/null || true
fi

chmod 600 "${output_dir}/control-plane.env" 2>/dev/null || true

cat <<EOF
Rendered:
  ${output_dir}/control-plane.env
EOF

if [[ -n "${EXECUTION_NODE_PRIVATE_IP:-}" ]]; then
  cat <<EOF
  ${output_dir}/execution-node.env
EOF
fi

cat <<EOF

HTTP app domain:
  ${traefik_domain}

Control-plane private/reference IP:
  ${control_plane_private_ip}

Control-plane API bind/listen IP:
  ${control_plane_api_bind}

Execution-node API target host:
  ${control_plane_api_host}
EOF

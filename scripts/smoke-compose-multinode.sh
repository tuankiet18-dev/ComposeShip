#!/usr/bin/env bash
set -euo pipefail

api_url="${CONTROL_PLANE_API_URL:-}"
node_id="${EXECUTION_NODE_ID:-}"
node_token="${EXECUTION_NODE_TOKEN:-}"
app_url="${APP_URL:-}"
api_route_url="${APP_API_URL:-}"

usage() {
  cat <<'EOF'
Usage:
  CONTROL_PLANE_API_URL=http://1.2.3.4.sslip.io/api \
  EXECUTION_NODE_ID=<node-id> \
  EXECUTION_NODE_TOKEN=<token> \
  APP_URL=http://app-project.1.2.3.4.sslip.io \
  APP_API_URL=http://api-project.1.2.3.4.sslip.io \
  ./scripts/smoke-compose-multinode.sh

Only CONTROL_PLANE_API_URL is required. If node/app URLs are provided, the
script validates those too.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "$api_url" ]]; then
  echo "CONTROL_PLANE_API_URL is required." >&2
  usage
  exit 1
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd curl

echo "Checking control-plane health..."
health_base="${api_url%/api}"
curl -fsS "${health_base}/health" >/dev/null
echo "  ok: ${health_base}/health"

if [[ -n "$node_id" && -n "$node_token" ]]; then
  echo "Checking execution-node authenticated heartbeat endpoint..."
  curl -fsS \
    -H "Content-Type: application/json" \
    -H "X-ComposeShip-Node-Token: ${node_token}" \
    -d '{"currentBuilds":0,"status":"active"}' \
    "${api_url}/execution-nodes/${node_id}/heartbeat" >/dev/null
  echo "  ok: execution node heartbeat"
else
  echo "Skipping execution node heartbeat check; EXECUTION_NODE_ID/TOKEN not set."
fi

if [[ -n "$api_route_url" ]]; then
  echo "Checking fixture API health and DB connectivity..."
  curl -fsS "${api_route_url%/}/health" >/dev/null
  curl -fsS "${api_route_url%/}/db-check" >/dev/null
  echo "  ok: fixture API route"
else
  echo "Skipping fixture API route check; APP_API_URL not set."
fi

if [[ -n "$app_url" ]]; then
  echo "Checking fixture frontend route..."
  curl -fsS "$app_url" >/dev/null
  echo "  ok: fixture frontend route"
else
  echo "Skipping fixture frontend route check; APP_URL not set."
fi

echo "Smoke checks completed."

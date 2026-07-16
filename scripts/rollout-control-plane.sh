#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: rollout-control-plane.sh --host <control-plane-ip-or-hostname> --ref <40-char-commit-sha> [--identity <ssh-key>]

Rolls the control-plane application forward or back without replacing the EC2
instance or its PostgreSQL volume. Run only after the reviewed commit has
passed CI and a PostgreSQL backup is confirmed.
EOF
}

host=""
ref=""
identity=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) host="${2:-}"; shift 2 ;;
    --ref) ref="${2:-}"; shift 2 ;;
    --identity) identity="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 64 ;;
  esac
done

if [[ -z "$host" || ! "$ref" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "A control-plane host and a 40-character commit SHA are required." >&2
  usage >&2
  exit 64
fi

ssh_args=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new)
if [[ -n "$identity" ]]; then
  ssh_args+=(-i "$identity")
fi

ssh "${ssh_args[@]}" "ubuntu@$host" "bash -s -- '$ref'" <<'REMOTE'
set -euo pipefail
ref="$1"
root=/opt/oneclick-host
env_file="$root/.generated/multinode/control-plane.env"
compose=(docker compose -f "$root/docker-compose.control-plane.yml" --env-file "$env_file")

test -f "$env_file"
cd "$root"
git fetch --all --tags
git checkout --detach "$ref"
test "$(git rev-parse HEAD)" = "$ref"

# Build first, then migrate explicitly. PostgreSQL stays running throughout.
"${compose[@]}" build api worker frontend
"${compose[@]}" run --rm --no-deps api --migrate
"${compose[@]}" up -d --no-deps api worker frontend traefik
"${compose[@]}" ps
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:5000/health >/dev/null
echo "Control-plane rollout complete at $(git rev-parse HEAD)."
REMOTE

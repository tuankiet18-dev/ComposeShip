#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TERRAFORM_DIR="${TERRAFORM_DIR:-$ROOT_DIR/infra/aws/mvp}"
FRONTEND_DIR="${FRONTEND_DIR:-$ROOT_DIR/frontend}"
API_BASE="${VITE_API_URL:-/api}"
ABUSE_CONTACT_EMAIL="${ABUSE_CONTACT_EMAIL:-}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command aws
require_command npm
require_command terraform

if [[ -z "$ABUSE_CONTACT_EMAIL" ]]; then
  echo "ABUSE_CONTACT_EMAIL is required for a production frontend publish." >&2
  exit 1
fi

cd "$TERRAFORM_DIR"
BUCKET_NAME="$(terraform output -raw frontend_bucket_name)"
DISTRIBUTION_ID="$(terraform output -raw cloudfront_distribution_id)"
FRONTEND_URL="$(terraform output -raw app_url)"

cd "$FRONTEND_DIR"
npm ci
VITE_API_URL="$API_BASE" VITE_ABUSE_CONTACT_EMAIL="$ABUSE_CONTACT_EMAIL" npm run build

aws s3 sync dist "s3://$BUCKET_NAME" \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html"

aws s3 cp dist/index.html "s3://$BUCKET_NAME/index.html" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --content-type "text/html"

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" >/dev/null

echo "Frontend deployed: $FRONTEND_URL"

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/config.yml"

# Copy config to a temp file so Docker can mount it
# (works around Docker volume mount issues with spaces in paths)
TMP_CONFIG="$(mktemp)"
cp "$CONFIG" "$TMP_CONFIG"
trap 'rm -f "$TMP_CONFIG"' EXIT

echo "Starting BuildValve (dev mode) on http://localhost:3000"
echo "  Mock auth:   Bypass Login (Dev) as alice@company.com"
echo "  Mock GitLab: pipelines auto-complete after ~15s"
echo ""

docker run --rm \
  -v "$TMP_CONFIG:/app/config/config.yml:ro" \
  -e NODE_ENV=development \
  -p 3000:3000 \
  ghcr.io/cergfix/buildvalve:latest

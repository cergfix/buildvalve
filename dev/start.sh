#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Building dev image (extends buildvalve with dev config)..."
docker build -t buildvalve-dev "$SCRIPT_DIR"

echo ""
echo "Starting BuildValve (dev mode) on http://localhost:3000"
echo "  Mock auth:   Bypass Login (Dev) as alice@company.com"
echo "  Mock GitLab: pipelines auto-complete after ~15s"
echo ""

docker run --rm -p 3000:3000 buildvalve-dev

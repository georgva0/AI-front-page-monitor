#!/usr/bin/env bash
set -euo pipefail

RENDER_BASE_URL="${RENDER_BASE_URL:-https://ai-front-page-monitor.onrender.com}"
HEALTH_URL="${RENDER_BASE_URL%/}/health"

TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if curl -fsS --max-time 20 "$HEALTH_URL" > /dev/null; then
  echo "$TIMESTAMP keepalive ok: $HEALTH_URL"
else
  echo "$TIMESTAMP keepalive failed: $HEALTH_URL" >&2
  exit 1
fi

#!/usr/bin/env bash
#
# Production deployment helper — run on the host that serves the site (RPi4).
# Pulls the latest main, rebuilds the image and restarts the container.
#
# Usage: development/deploy.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8080/}"
CONTAINER="${CONTAINER:-basketballrules}"
TIMEOUT="${TIMEOUT:-120}"

echo "==> Pulling latest changes"
git pull --ff-only

echo "==> Rebuilding and restarting the container"
docker compose up -d --build

echo "==> Waiting for the container to become healthy (up to ${TIMEOUT}s)"
for _ in $(seq 1 "$((TIMEOUT / 2))"); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo starting)"
  if [ "$status" = "healthy" ]; then
    code="$(curl -fsS -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || echo 000)"
    echo "==> Healthy: ${HEALTH_URL} -> ${code}"
    exit 0
  fi
  sleep 2
done

echo "!! Container '$CONTAINER' did not become healthy within ${TIMEOUT}s" >&2
docker logs --tail 30 "$CONTAINER" >&2 || true
exit 1

#!/bin/sh
# Deploy the backend to greencloud: ./deploy/deploy.sh
set -e
cd "$(dirname "$0")/.."
tar czf - package.json package-lock.json tsconfig.json src | ssh greencloud 'cd /opt/voicememo/app && tar xzf - && npm ci --omit=dev --no-fund --no-audit >/dev/null && systemctl restart murmur && sleep 2 && curl -sf http://127.0.0.1:8791/health'
echo

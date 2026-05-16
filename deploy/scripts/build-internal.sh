#!/usr/bin/env bash
# Build web for internal pilot. Requires apps/web/.env.production.local
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
ENV_FILE="$ROOT/apps/web/.env.production.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Copy .env.internal.example -> apps/web/.env.production.local"
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
npm run build --workspace @mbox/shared
npm run build --workspace @mbox/web
echo "Output: apps/web/dist"

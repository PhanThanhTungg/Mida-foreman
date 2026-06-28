#!/bin/sh
# foreman/apps/api/entrypoint.sh
set -e

echo "Running Prisma migrations…"
# ponytail: glob resolves the pnpm virtual store path without hardcoding version
PRISMA_BIN=$(ls /app/node_modules/.pnpm/prisma@*/node_modules/prisma/build/index.js 2>/dev/null | head -1)
cd /app/apps/api
DATABASE_URL="${DATABASE_URL}" node "$PRISMA_BIN" migrate deploy

echo "Starting API…"
exec node /app/apps/api/dist/apps/api/src/main

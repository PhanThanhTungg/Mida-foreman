#!/bin/sh
# foreman/apps/api/entrypoint.sh
set -e

echo "Running Prisma migrations…"
cd /app/apps/api
npx prisma migrate deploy

echo "Starting API…"
exec node /app/apps/api/dist/main

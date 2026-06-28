# foreman/apps/api/Dockerfile
FROM node:20-alpine AS base
RUN npm install -g pnpm@9 @anthropic-ai/claude-code
WORKDIR /app

# ── deps: install all workspace dependencies ────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
RUN pnpm install --frozen-lockfile

# ── build: compile TypeScript + generate Prisma client ──────────────────────
FROM deps AS build
COPY apps/api/ ./apps/api/
COPY packages/types/ ./packages/types/
RUN pnpm --filter @foreman/api exec prisma generate
RUN pnpm --filter @foreman/api build

# ── development: hot-reload (mounted source overrides /app) ─────────────────
FROM deps AS development
COPY apps/api/ ./apps/api/
COPY packages/types/ ./packages/types/
RUN pnpm --filter @foreman/api exec prisma generate
EXPOSE 3001
CMD ["pnpm", "--filter", "@foreman/api", "dev"]

# ── production: minimal runtime image ───────────────────────────────────────
FROM node:20-alpine AS production
RUN apk add --no-cache openssl && npm install -g pnpm@9 @anthropic-ai/claude-code
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["/app/entrypoint.sh"]

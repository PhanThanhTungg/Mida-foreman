# foreman/apps/web/Dockerfile
FROM node:20-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

# ── deps: install all workspace dependencies ────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
RUN pnpm install --frozen-lockfile

# ── build: Next.js production build ─────────────────────────────────────────
FROM deps AS build
COPY apps/web/ ./apps/web/
COPY packages/types/ ./packages/types/
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_API_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_KEY=$NEXT_PUBLIC_API_KEY
RUN pnpm --filter @foreman/web build

# ── development: hot-reload ──────────────────────────────────────────────────
FROM deps AS development
COPY apps/web/ ./apps/web/
COPY packages/types/ ./packages/types/
EXPOSE 3000
ENV NEXT_TELEMETRY_DISABLED=1
CMD ["pnpm", "--filter", "@foreman/web", "dev"]

# ── production: Next.js standalone ──────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]

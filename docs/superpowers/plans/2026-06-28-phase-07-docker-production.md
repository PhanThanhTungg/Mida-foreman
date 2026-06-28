# Phase 7: Docker Production — Foreman

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write multi-stage Dockerfiles for `api` and `web`, and finalize `docker-compose.yml` so `docker compose up` builds and starts the full stack end-to-end.

**Architecture:** Both Dockerfiles follow the same 4-stage pattern: `deps` (install) → `build` → `production` (minimal runtime) + `development` (hot-reload). The API runs `prisma migrate deploy` before starting via an entrypoint script. The web uses Next.js `output: 'standalone'`. Repo paths mounted from host into the `api` container at the same absolute path so DB-stored paths resolve correctly.

**Tech Stack:** Docker multi-stage builds, Node.js 20-alpine, pnpm 9

**Prerequisite:** All previous phases complete (Phases 1–6). The `docker-compose.yml` from Phase 1 already has service stubs; this phase replaces the placeholder `build:` sections with real Dockerfiles.

---

## File Structure

```
foreman/
├── apps/
│   ├── api/
│   │   ├── Dockerfile
│   │   └── entrypoint.sh           # runs prisma migrate deploy then node dist/main
│   └── web/
│       └── Dockerfile
└── docker-compose.yml              # finalized (already created in Phase 1)
```

---

### Task 1: API Dockerfile

**Files:**
- Create: `foreman/apps/api/Dockerfile`
- Create: `foreman/apps/api/entrypoint.sh`
- Modify: `foreman/apps/api/package.json` — add `"prisma": { "schema": "prisma/schema.prisma" }` if missing

**Interfaces:**
- Produces:
  - `target: production` — runs `node dist/main` after `prisma migrate deploy`; final image ~200MB
  - `target: development` — runs `pnpm dev` with source mounted from host

- [ ] **Step 1: Create apps/api/Dockerfile**

```dockerfile
# foreman/apps/api/Dockerfile
FROM node:20-alpine AS base
RUN npm install -g pnpm@9
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
RUN npm install -g pnpm@9
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/node_modules/.prisma ./apps/api/node_modules/.prisma
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["/app/entrypoint.sh"]
```

- [ ] **Step 2: Create apps/api/entrypoint.sh**

```bash
#!/bin/sh
# foreman/apps/api/entrypoint.sh
set -e

echo "Running Prisma migrations…"
cd /app/apps/api
npx prisma migrate deploy

echo "Starting API…"
exec node /app/apps/api/dist/main
```

- [ ] **Step 3: Verify api Docker build (production target)**

```bash
cd foreman
docker build -f apps/api/Dockerfile --target production -t foreman-api:test .
```
Expected: build succeeds, image tagged `foreman-api:test`

```bash
docker images foreman-api:test
```
Expected: image listed with size < 500MB

- [ ] **Step 4: Commit**

```bash
cd foreman
git add apps/api/Dockerfile apps/api/entrypoint.sh
git commit -m "chore(api): add multi-stage Dockerfile with Prisma migration entrypoint"
```

---

### Task 2: Web Dockerfile

**Files:**
- Create: `foreman/apps/web/Dockerfile`

**Interfaces:**
- Produces:
  - `target: production` — Next.js standalone build, runs `node server.js`; final image ~150MB
  - `target: development` — runs `pnpm dev` with source mounted from host

- [ ] **Step 1: Create apps/web/Dockerfile**

```dockerfile
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
```

- [ ] **Step 2: Verify web Docker build (production target)**

```bash
cd foreman
docker build -f apps/web/Dockerfile --target production -t foreman-web:test .
```
Expected: build succeeds. If it fails on the standalone copy, ensure `next.config.js` has `output: 'standalone'`.

```bash
docker images foreman-web:test
```
Expected: image listed with size < 300MB

- [ ] **Step 3: Commit**

```bash
cd foreman
git add apps/web/Dockerfile
git commit -m "chore(web): add multi-stage Dockerfile with Next.js standalone output"
```

---

### Task 3: Full Stack docker compose up

**Files:**
- No new files (docker-compose.yml already written in Phase 1)
- Verify the full stack starts end-to-end

**Interfaces:**
- Produces: all 4 services healthy — postgres, redis, api, web

- [ ] **Step 1: Create production .env**

```bash
cd foreman
cp .env.example .env
# Edit .env with real values:
# DATABASE_URL=postgresql://foreman:foreman@postgres:5432/foreman   ← use service name, not localhost
# REDIS_URL=redis://redis:6379                                        ← use service name
# API_KEY=your-secure-key
# ANTHROPIC_API_KEY=sk-ant-...
# PORT=3001
# NODE_ENV=production
# REPOS_BASE_PATH=/path/to/your/local/repos
```

Note: inside Docker Compose, services reach each other by service name (`postgres`, `redis`), not `localhost`.

- [ ] **Step 2: Build all services**

```bash
cd foreman
docker compose build
```
Expected: all 4 images built successfully

- [ ] **Step 3: Start the full stack**

```bash
cd foreman
docker compose up -d
```
Expected: all 4 services start

```bash
docker compose ps
```
Expected: postgres (healthy), redis (healthy), api (healthy), web (running)

- [ ] **Step 4: Verify API health**

```bash
curl -s http://localhost:3001/health | jq .
```
Expected: `{ "status": "ok" }`

- [ ] **Step 5: Verify API auth works**

```bash
# Without key — should 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/tasks
# Expected: 401

# With key — should 200
curl -s -H "x-api-key: your-secure-key" http://localhost:3001/api/tasks | jq .
# Expected: []
```

- [ ] **Step 6: Verify web loads**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```
Expected: `200` or `307` (redirect to /tasks)

- [ ] **Step 7: Set NEXT_PUBLIC env vars in web service**

The web container needs `NEXT_PUBLIC_*` vars at build time (Next.js bakes them in). Add to `docker-compose.yml` under the `web` service:

```yaml
# Add to web service in docker-compose.yml:
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      target: production
      args:
        NEXT_PUBLIC_API_URL: http://localhost:3001
        NEXT_PUBLIC_WS_URL: http://localhost:3001
        NEXT_PUBLIC_API_KEY: ${API_KEY}
    env_file: .env
    ports:
      - "3000:3000"
    depends_on:
      api:
        condition: service_healthy
```

And in `apps/web/Dockerfile`, add ARG declarations in the `build` stage:

```dockerfile
# Add to the build stage in apps/web/Dockerfile (after FROM deps AS build):
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_API_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_KEY=$NEXT_PUBLIC_API_KEY
```

- [ ] **Step 8: Rebuild web with env vars and re-verify**

```bash
docker compose build web
docker compose up -d web
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/tasks
```
Expected: `200`

- [ ] **Step 9: Test dev compose override**

```bash
cd foreman
docker compose -f docker-compose.yml -f docker-compose.dev.yml up api -d
```
Expected: api starts with source mounted, changes to `apps/api/src` trigger reload

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

- [ ] **Step 10: Final commit**

```bash
cd foreman
git add docker-compose.yml apps/api/Dockerfile apps/web/Dockerfile
git commit -m "chore: finalize Docker production stack with multi-stage builds and compose wiring"
```

---

## Post-Phase Checklist

After Phase 7 is complete, run this end-to-end verification:

- [ ] `docker compose up -d` — all 4 services reach healthy
- [ ] `GET /health` → `{ "status": "ok" }`
- [ ] `POST /api/repos` (with x-api-key) — creates a repo
- [ ] `POST /api/repos/:id/verify` — returns `{ pathExists, isGitRepo, canGitStatus }`
- [ ] `POST /api/tasks` — creates a task (confirm BullMQ job added: check redis `KEYS foreman:*`)
- [ ] Task log streams in the web UI via WebSocket
- [ ] Settings saved/loaded with token masking
- [ ] Jira poller starts (logs "Jira poller starting" if `jira_api_token` is configured)

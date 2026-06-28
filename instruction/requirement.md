# Foreman — AI Agent System

Build a production-ready monorepo called **Foreman** — a system that receives tasks from Jira and automatically implements them by running Claude AI (via Anthropic SDK with tool use) inside locally configured code repositories.

---

## Tech stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Backend**: NestJS 10+ (TypeScript strict)
- **Frontend**: Next.js 14+ App Router + TailwindCSS + shadcn/ui
- **Database**: PostgreSQL 16 + Prisma ORM (migrations only, no raw SQL)
- **Queue**: BullMQ + Redis
- **AI**: `@anthropic-ai/sdk` — agentic tool-use loop
- **Infra**: Docker multi-stage + Docker Compose

---

## Monorepo structure

```
foreman/
├── apps/api/        # NestJS backend
├── apps/web/        # Next.js frontend
├── packages/types/  # Shared TypeScript types (@foreman/types)
├── docker-compose.yml
├── docker-compose.dev.yml
├── turbo.json
└── pnpm-workspace.yaml
```

---

## Core design decisions

**AI integration via SDK, not CLI subprocess**
Foreman calls `@anthropic-ai/sdk` directly with a tool-use loop. Claude is given typed tools (`read_file`, `write_file`, `list_directory`, `execute_command`, `create_pull_request`, `foreman_complete`) and runs an agentic loop until it calls `foreman_complete` or hits max iterations. Every tool call is logged. File paths are validated to stay within the repo root. Shell commands are whitelist-restricted (`git`, `npm`, `pnpm`, `tsc`, etc.).

**Agent plugin pattern**
Four agent types: `feature`, `bugfix`, `support`, `improve`. Each is a class that defines:
- A system prompt encoding the full workflow for that domain
- Allowed tools subset
- Max SDK iterations
- Success conditions to check post-run (`mr_created`, `ci_passed`, `no_build_errors`)

**Retry loop**
Each task runs up to `max_rounds` (default 5). Each round: build prompt → run Claude SDK loop → observe success conditions → if failed, pass error context to next round → after all rounds exhausted, mark task `failed`.

**Per-repo concurrency**
Jobs run via BullMQ. A Redis lock (`SETNX`) prevents two jobs on the same repo running simultaneously. If a lock is held, the job re-queues with a delay.

**Credentials in DB, not .env**
Only infra secrets go in `.env`: `DATABASE_URL`, `REDIS_URL`, `API_KEY`, `ANTHROPIC_API_KEY`, `PORT`, `NODE_ENV`. All user credentials (Jira, GitHub) are stored in a `settings` key-value table and read at runtime.

---

## Data model (Prisma)

**Task**: `id`, `issueKey`, `title`, `repoId` (FK), `agentType` (enum), `status` (enum: queued/running/done/failed), `round`, `maxRounds`, `log` (append-only text), `mrUrl`, `error`, `createdAt`, `updatedAt`

**Repo**: `id`, `name` (unique), `path` (absolute local path), `githubRepo` (`org/repo`), `description`, `active`, `createdAt`

**Setting**: `key` (PK), `value` — default keys: `jira_base_url`, `jira_email`, `jira_api_token`, `github_token`, `poll_interval_ms`

---

## NestJS modules

| Module | Responsibility |
|---|---|
| `TasksModule` | CRUD + enqueue via `OrchestratorService` |
| `ReposModule` | CRUD + `/verify` endpoint |
| `SettingsModule` | Key-value upsert; mask sensitive keys on GET |
| `AgentsModule` | Agent registry + `GET /api/agent-types` |
| `WorkersModule` | BullMQ processor, Claude runner, tool executor, observer |
| `TriggersModule` | Jira poller (dynamic interval re-read from DB each cycle) |
| `GatewayModule` | WebSocket gateway (`/ws` namespace) |
| `HealthModule` | `GET /health` — public, checks DB + Redis |

Apply globally: `ValidationPipe`, `AllExceptionsFilter`, `ApiKeyGuard` (exclude `/health` with `@Public()`).

---

## API routes

**Tasks** `GET /api/tasks`, `GET /api/tasks/:id`, `POST /api/tasks`, `DELETE /api/tasks/:id` (queued only)

**Repos** `GET /api/repos`, `POST /api/repos`, `PUT /api/repos/:id`, `DELETE /api/repos/:id`, `POST /api/repos/:id/verify`

**Settings** `GET /api/settings` (mask `*_token`, `*_api_token` values), `PUT /api/settings`

**Misc** `GET /api/agent-types`, `GET /health`, `GET /api/docs` (Swagger, dev only)

**WebSocket** Server emits two message shapes: `{ type: 'log', taskId, line }` and `{ type: 'status', taskId, status, round }`

---

## Jira poller

- Starts on `OnApplicationBootstrap`; only runs if `jira_api_token` is set in DB
- JQL: `project in (MAH, MIDA) AND status = "To Do" AND assignee = currentUser()`
- Agent type detected from Jira labels: `agent:feature`, `agent:bugfix`, `agent:support`, `agent:improve`
- Target repo detected from label: `repo:<name>` → lookup by `Repo.name`; skip with warning if not found
- Deduplication via in-memory `Set<string>` of already-queued issue keys
- Re-reads `poll_interval_ms` from DB each cycle so UI changes take effect without restart

---

## Next.js frontend

**Pages**: Tasks (default), Repos, Settings — top nav via shadcn `NavigationMenu`. Dark theme by default.

**Tasks page**: two-panel layout — left column (fixed width): `TaskForm` + `TaskList`; right panel (flex): `LogViewer` for selected task.

**Component split**: page-level Server Components for initial data fetch; all interactive parts as `'use client'` components.

**TaskList**: shadcn `Table` + `Badge` for status (queued=gray, running=blue, done=green, failed=red) and agent type (feature=purple, bugfix=red, support=teal, improve=amber). SWR poll every 3s.

**LogViewer**: dark terminal (`#0d1117` bg, monospace font), auto-scroll to bottom, round separator lines, WebSocket subscription filtered by `taskId`, loads existing log on mount.

**RepoManager**: table + `Dialog` for add/edit + `AlertDialog` for delete confirm + inline verify badge results (path exists / is git repo / can git status).

**SettingsForm**: credential fields (Jira + GitHub tokens as password inputs), poll interval, status badges "Configured" / "Not set".

**Hooks**: `useTasks` (SWR 3s), `useRepos` (fetch), `useTaskLog` (WebSocket, connect on mount, disconnect on unmount).

---

## Docker

Four services in `docker-compose.yml`: `postgres` (postgres:16-alpine), `redis` (redis:7-alpine), `api`, `web`. All with health checks. `api` depends on postgres + redis healthy. Mount `REPOS_BASE_PATH` into `api` container at the same absolute path so repo paths configured in DB resolve correctly.

Multi-stage Dockerfiles for both `api` and `web` (stages: `deps` → `build` → `production`, plus `development` stage for hot reload). `api` runs `prisma migrate deploy` before starting. `web` uses Next.js `output: 'standalone'`.

`docker-compose.dev.yml` overrides: mount source directories, run `pnpm dev`.

---

## Coding standards

- No `any` — use Prisma-generated types for DB models, `unknown` + narrowing elsewhere
- All DB access through Prisma in service classes — zero raw SQL
- DTOs on all incoming HTTP data with `class-validator`; `ValidationPipe` global with `whitelist: true`
- NestJS `Logger` with class context everywhere — no `console.log`
- Controllers are thin (validate → call service → return); all logic in services
- Custom exceptions always include context (`Task ${id} not found`)
- Co-located `*.spec.ts` unit tests for all services and agent classes
- Swagger decorators on all controllers
# Foreman — Implementation Plans Index

7 phases, each independently executable and testable. Complete them in order.

| Phase | File | Deliverable |
|---|---|---|
| 1 | [2026-06-28-phase-01-monorepo-foundation.md](./2026-06-28-phase-01-monorepo-foundation.md) | Turborepo + pnpm + `@foreman/types` + Docker Compose infra |
| 2 | [2026-06-28-phase-02-api-foundation.md](./2026-06-28-phase-02-api-foundation.md) | NestJS scaffold + Prisma + ApiKeyGuard + HealthModule |
| 3 | [2026-06-28-phase-03-domain-modules.md](./2026-06-28-phase-03-domain-modules.md) | ReposModule + SettingsModule + TasksModule + AgentsModule |
| 4 | [2026-06-28-phase-04-worker-engine.md](./2026-06-28-phase-04-worker-engine.md) | BullMQ + ToolExecutor + ClaudeRunner + RepoLock + RetryLoop |
| 5 | [2026-06-28-phase-05-triggers-gateway.md](./2026-06-28-phase-05-triggers-gateway.md) | WebSocket Gateway + Jira Poller |
| 6 | [2026-06-28-phase-06-frontend.md](./2026-06-28-phase-06-frontend.md) | Next.js 14 + Tasks/Repos/Settings pages + WebSocket log stream |
| 7 | [2026-06-28-phase-07-docker-production.md](./2026-06-28-phase-07-docker-production.md) | Multi-stage Dockerfiles + full `docker compose up` |

## Execution

Each plan file contains complete code — no placeholders. Use with:

```
superpowers:subagent-driven-development   # recommended
superpowers:executing-plans               # inline
```

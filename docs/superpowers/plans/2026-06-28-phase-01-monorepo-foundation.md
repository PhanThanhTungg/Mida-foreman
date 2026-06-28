# Phase 1: Monorepo Foundation — Foreman

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize the Turborepo monorepo with pnpm workspaces, shared `@foreman/types` package, and Docker Compose infrastructure for local development.

**Architecture:** pnpm + Turborepo monorepo with `apps/api`, `apps/web`, and `packages/types`. The types package is the single source of truth for all cross-boundary TypeScript — no type duplication between frontend and backend. Docker Compose provides postgres:16-alpine and redis:7-alpine for local dev.

**Tech Stack:** Turborepo 2+, pnpm 9+, Node.js 20+, TypeScript 5.4+, Docker Compose v2

## Global Constraints

- TypeScript `"strict": true` in all tsconfigs — no exceptions
- `pnpm` only — never npm or yarn inside the monorepo
- Node.js >= 20 everywhere
- No `any` type — use `unknown` + type narrowing
- `.env` holds ONLY: `DATABASE_URL`, `REDIS_URL`, `API_KEY`, `ANTHROPIC_API_KEY`, `PORT`, `NODE_ENV`, `REPOS_BASE_PATH`
- All user credentials (Jira, GitHub) stored in the `Setting` DB table — never in .env
- NestJS 10+, Next.js 14+ App Router, PostgreSQL 16, Redis 7

---

## File Structure

```
foreman/
├── .gitignore
├── .env.example
├── package.json                    # root workspace — turbo scripts
├── pnpm-workspace.yaml
├── turbo.json
├── docker-compose.yml              # postgres + redis + api/web production
├── docker-compose.dev.yml          # dev override: source mounts + pnpm dev
├── apps/
│   ├── api/                        # (scaffolded in Phase 2)
│   └── web/                        # (scaffolded in Phase 6)
└── packages/
    └── types/
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts            # barrel re-export
            ├── task.types.ts       # TaskStatus, AgentType, Task
            ├── repo.types.ts       # Repo, RepoVerifyResult
            ├── settings.types.ts   # SettingKey, Setting
            ├── agent.types.ts      # ToolName, AgentConfig, AgentRunResult, RoundContext
            └── ws.types.ts         # WsMessage
```

---

### Task 1: Initialize Root Monorepo Scaffold

**Files:**
- Create: `foreman/package.json`
- Create: `foreman/pnpm-workspace.yaml`
- Create: `foreman/turbo.json`
- Create: `foreman/.gitignore`
- Create: `foreman/.env.example`

**Interfaces:**
- Produces: root workspace with `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint` scripts wired through Turborepo

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p foreman/apps/api foreman/apps/web foreman/packages/types/src
cd foreman
git init
```

- [ ] **Step 2: Create root package.json**

```json
{
  "name": "foreman",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\""
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "prettier": "^3.2.5",
    "typescript": "^5.4.5"
  },
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 3: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 4: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    }
  }
}
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.next/
coverage/
.env
*.env.local
.turbo/
*.tsbuildinfo
pnpm-lock.yaml.bak
```

- [ ] **Step 6: Create .env.example**

```env
DATABASE_URL=postgresql://foreman:foreman@localhost:5432/foreman
REDIS_URL=redis://localhost:6379
API_KEY=changeme-development-key
ANTHROPIC_API_KEY=sk-ant-api03-...
PORT=3001
NODE_ENV=development
REPOS_BASE_PATH=/home/user/repos
```

- [ ] **Step 7: Install and verify Turborepo**

```bash
cd foreman
pnpm install
pnpm turbo --version
```
Expected: Turborepo version `2.x.x` printed

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .gitignore .env.example
git commit -m "chore: initialize Turborepo monorepo root"
```

---

### Task 2: Create @foreman/types Package

**Files:**
- Create: `foreman/packages/types/package.json`
- Create: `foreman/packages/types/tsconfig.json`
- Create: `foreman/packages/types/src/task.types.ts`
- Create: `foreman/packages/types/src/repo.types.ts`
- Create: `foreman/packages/types/src/settings.types.ts`
- Create: `foreman/packages/types/src/agent.types.ts`
- Create: `foreman/packages/types/src/ws.types.ts`
- Create: `foreman/packages/types/src/index.ts`

**Interfaces:**
- Produces (exact named exports from `@foreman/types`):
  - `TaskStatus = 'queued' | 'running' | 'done' | 'failed'`
  - `AgentType = 'feature' | 'bugfix' | 'support' | 'improve'`
  - `interface Task { id: string; issueKey: string; title: string; repoId: string; agentType: AgentType; status: TaskStatus; round: number; maxRounds: number; log: string; mrUrl: string | null; error: string | null; createdAt: Date; updatedAt: Date }`
  - `interface Repo { id: string; name: string; path: string; githubRepo: string; description: string; active: boolean; createdAt: Date }`
  - `interface RepoVerifyResult { pathExists: boolean; isGitRepo: boolean; canGitStatus: boolean }`
  - `SettingKey = 'jira_base_url' | 'jira_email' | 'jira_api_token' | 'github_token' | 'poll_interval_ms'`
  - `interface Setting { key: string; value: string }`
  - `ToolName = 'read_file' | 'write_file' | 'list_directory' | 'execute_command' | 'create_pull_request' | 'foreman_complete'`
  - `SuccessCondition = 'mr_created' | 'ci_passed' | 'no_build_errors'`
  - `interface AgentConfig { type: AgentType; systemPrompt: string; allowedTools: ToolName[]; maxIterations: number; successConditions: SuccessCondition[] }`
  - `interface AgentRunResult { success: boolean; mrUrl: string | null; error: string | null; log: string }`
  - `interface RoundContext { taskId: string; repoPath: string; issueKey: string; title: string; round: number; previousError: string | null }`
  - `type WsMessage = { type: 'log'; taskId: string; line: string } | { type: 'status'; taskId: string; status: TaskStatus; round: number }`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@foreman/types",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc --noEmit",
    "test": "tsc --noEmit",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Run tsc to confirm failure (no source files yet)**

```bash
cd foreman/packages/types
npx tsc --noEmit 2>&1 | head -3
```
Expected: error — no input files

- [ ] **Step 4: Create task.types.ts**

```typescript
// foreman/packages/types/src/task.types.ts
export type TaskStatus = 'queued' | 'running' | 'done' | 'failed';
export type AgentType = 'feature' | 'bugfix' | 'support' | 'improve';

export interface Task {
  id: string;
  issueKey: string;
  title: string;
  repoId: string;
  agentType: AgentType;
  status: TaskStatus;
  round: number;
  maxRounds: number;
  log: string;
  mrUrl: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 5: Create repo.types.ts**

```typescript
// foreman/packages/types/src/repo.types.ts
export interface Repo {
  id: string;
  name: string;
  path: string;
  githubRepo: string;
  description: string;
  active: boolean;
  createdAt: Date;
}

export interface RepoVerifyResult {
  pathExists: boolean;
  isGitRepo: boolean;
  canGitStatus: boolean;
}
```

- [ ] **Step 6: Create settings.types.ts**

```typescript
// foreman/packages/types/src/settings.types.ts
export type SettingKey =
  | 'jira_base_url'
  | 'jira_email'
  | 'jira_api_token'
  | 'github_token'
  | 'poll_interval_ms';

export interface Setting {
  key: string;
  value: string;
}
```

- [ ] **Step 7: Create agent.types.ts**

```typescript
// foreman/packages/types/src/agent.types.ts
import type { AgentType } from './task.types';

export type ToolName =
  | 'read_file'
  | 'write_file'
  | 'list_directory'
  | 'execute_command'
  | 'create_pull_request'
  | 'foreman_complete';

export type SuccessCondition = 'mr_created' | 'ci_passed' | 'no_build_errors';

export interface AgentConfig {
  type: AgentType;
  systemPrompt: string;
  allowedTools: ToolName[];
  maxIterations: number;
  successConditions: SuccessCondition[];
}

export interface AgentRunResult {
  success: boolean;
  mrUrl: string | null;
  error: string | null;
  log: string;
}

export interface RoundContext {
  taskId: string;
  repoPath: string;
  issueKey: string;
  title: string;
  round: number;
  previousError: string | null;
}
```

- [ ] **Step 8: Create ws.types.ts**

```typescript
// foreman/packages/types/src/ws.types.ts
import type { TaskStatus } from './task.types';

export type WsMessage =
  | { type: 'log'; taskId: string; line: string }
  | { type: 'status'; taskId: string; status: TaskStatus; round: number };
```

- [ ] **Step 9: Create index.ts barrel**

```typescript
// foreman/packages/types/src/index.ts
export * from './task.types';
export * from './repo.types';
export * from './settings.types';
export * from './agent.types';
export * from './ws.types';
```

- [ ] **Step 10: Install deps and verify types compile**

```bash
cd foreman
pnpm install
pnpm --filter @foreman/types build
```
Expected: exit 0, no output errors

- [ ] **Step 11: Commit**

```bash
cd foreman
git add packages/types/
git commit -m "feat(types): add @foreman/types shared TypeScript definitions"
```

---

### Task 3: Docker Compose Infrastructure

**Files:**
- Modify: `foreman/docker-compose.yml` (production — postgres + redis + api + web)
- Create: `foreman/docker-compose.dev.yml` (dev override)

**Interfaces:**
- Produces:
  - `postgres` on `localhost:5432` (db/user/pw: `foreman`)
  - `redis` on `localhost:6379`
  - `api` + `web` service stubs (Dockerfiles added in Phase 7)

- [ ] **Step 1: Create docker-compose.yml**

```yaml
# foreman/docker-compose.yml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: foreman
      POSTGRES_USER: foreman
      POSTGRES_PASSWORD: foreman
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U foreman -d foreman"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: production
    env_file: .env
    ports:
      - "${PORT:-3001}:3001"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - "${REPOS_BASE_PATH:-/repos}:${REPOS_BASE_PATH:-/repos}"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3001/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      target: production
    env_file: .env
    ports:
      - "3000:3000"
    depends_on:
      api:
        condition: service_healthy

volumes:
  postgres_data:
  redis_data:
```

- [ ] **Step 2: Create docker-compose.dev.yml**

```yaml
# foreman/docker-compose.dev.yml
version: '3.9'

services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: development
    volumes:
      - ./apps/api/src:/app/apps/api/src
      - ./packages:/app/packages
      - api_nm:/app/node_modules
      - api_app_nm:/app/apps/api/node_modules
    command: pnpm --filter @foreman/api dev

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      target: development
    volumes:
      - ./apps/web/src:/app/apps/web/src
      - ./packages:/app/packages
      - web_nm:/app/node_modules
      - web_app_nm:/app/apps/web/node_modules
    command: pnpm --filter @foreman/web dev

volumes:
  api_nm:
  api_app_nm:
  web_nm:
  web_app_nm:
```

- [ ] **Step 3: Start infra services and verify**

```bash
cd foreman
cp .env.example .env
docker compose up postgres redis -d
```

```bash
docker compose ps
```
Expected: both `postgres` and `redis` show `(healthy)` in STATUS

```bash
docker compose exec postgres psql -U foreman -d foreman -c '\conninfo'
```
Expected: `You are connected to database "foreman" as user "foreman"`

```bash
docker compose exec redis redis-cli ping
```
Expected: `PONG`

- [ ] **Step 4: Commit**

```bash
cd foreman
git add docker-compose.yml docker-compose.dev.yml
git commit -m "chore: add Docker Compose for postgres:16 and redis:7"
```

# Foreman — Production System Prompt
## NestJS · Next.js 14 · PostgreSQL · Claude SDK

Build a production-ready AI agent system called **Foreman** — a standalone platform that receives
coding tasks from Jira and automatically implements them using the Anthropic Claude SDK with
tool-use agentic loops, operating inside locally configured repositories.

---

## Key Design Decisions

- Foreman is a **standalone project**, NOT inside any target repo
- Target repos are separate local projects, each runs independently
- **Agent Engine: `@anthropic-ai/sdk`** — tool-use agentic loop where Claude calls tools to read/write
  files and run shell commands in the repo. NO subprocess spawning of `claude` CLI
- Each agent type has a detailed **system prompt** encoding domain expertise (replaces CLI marketplace skills)
- Task completion is signalled via a `complete_task` **tool call** — structured, never parsed from text
- Repo paths configured via UI, stored in PostgreSQL via Prisma
- All credentials (`anthropic_api_key`, Jira, GitHub) stored **encrypted at rest** in the `settings`
  table using AES-256-GCM; the only secret in `.env` is `ENCRYPTION_KEY`
- Per-repo concurrency = 1 (no git conflicts), enforced by BullMQ job groups keyed by `repoId`
- Job IDs = task UUIDs → idempotent enqueue, no duplicates on restart
- Jira deduplication backed by DB (`QUEUED` + `RUNNING` task lookup on startup), not in-memory Set
- Observer verifies GitHub PR + CI after each agent round via `@octokit/rest`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend framework | NestJS 10, TypeScript strict |
| Database | PostgreSQL 16 + Prisma ORM |
| Job queue | BullMQ + Redis 7 |
| WebSocket | Socket.io (`@nestjs/platform-socket.io`) |
| Agent engine | `@anthropic-ai/sdk` (messages API, streaming, tool use) |
| GitHub API | `@octokit/rest` |
| HTTP client | `axios` |
| Frontend | Next.js 14 App Router, TypeScript |
| UI components | shadcn/ui + Tailwind CSS |
| Data fetching | TanStack Query v5 |
| Package manager | pnpm (workspaces monorepo) |

---

## Project Structure

```
foreman/
├── apps/
│   ├── api/                          # NestJS backend
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── modules/
│   │   │   │   ├── tasks/
│   │   │   │   │   ├── tasks.module.ts
│   │   │   │   │   ├── tasks.controller.ts
│   │   │   │   │   ├── tasks.service.ts
│   │   │   │   │   └── dto/
│   │   │   │   │       ├── create-task.dto.ts
│   │   │   │   │       └── task-filter.dto.ts
│   │   │   │   ├── repos/
│   │   │   │   │   ├── repos.module.ts
│   │   │   │   │   ├── repos.controller.ts
│   │   │   │   │   ├── repos.service.ts
│   │   │   │   │   └── dto/
│   │   │   │   │       ├── create-repo.dto.ts
│   │   │   │   │       └── update-repo.dto.ts
│   │   │   │   └── settings/
│   │   │   │       ├── settings.module.ts
│   │   │   │       ├── settings.controller.ts
│   │   │   │       └── settings.service.ts
│   │   │   ├── agents/
│   │   │   │   ├── agents.module.ts
│   │   │   │   ├── base-agent.ts
│   │   │   │   ├── feature.agent.ts
│   │   │   │   ├── bugfix.agent.ts
│   │   │   │   ├── support.agent.ts
│   │   │   │   ├── improve.agent.ts
│   │   │   │   └── agent.registry.ts
│   │   │   ├── workers/
│   │   │   │   ├── agent-loop.service.ts
│   │   │   │   ├── claude-runner.service.ts   # Claude SDK agentic loop
│   │   │   │   ├── tool-executor.service.ts   # executes Claude's tool calls
│   │   │   │   ├── agent-tools.ts             # AGENT_TOOLS definition
│   │   │   │   └── observer.service.ts
│   │   │   ├── queue/
│   │   │   │   ├── queue.module.ts
│   │   │   │   ├── task.processor.ts          # BullMQ WorkerHost
│   │   │   │   └── task-queue.service.ts
│   │   │   ├── gateways/
│   │   │   │   └── logs.gateway.ts            # Socket.io @WebSocketGateway
│   │   │   ├── triggers/
│   │   │   │   └── jira-poller.service.ts
│   │   │   ├── integrations/
│   │   │   │   ├── jira.client.ts
│   │   │   │   └── github.client.ts
│   │   │   └── common/
│   │   │       ├── config/
│   │   │       │   └── configuration.ts       # zod-validated env schema
│   │   │       ├── crypto/
│   │   │       │   └── encryption.service.ts  # AES-256-GCM for credentials
│   │   │       ├── filters/
│   │   │       │   └── all-exceptions.filter.ts
│   │   │       ├── interceptors/
│   │   │       │   ├── logging.interceptor.ts
│   │   │       │   └── transform.interceptor.ts
│   │   │       ├── guards/
│   │   │       │   └── api-key.guard.ts
│   │   │       ├── middleware/
│   │   │       │   └── request-id.middleware.ts
│   │   │       └── health/
│   │   │           └── health.controller.ts   # GET /health
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/                    # never edit by hand
│   │   ├── Dockerfile
│   │   ├── .env.example
│   │   └── package.json
│   │
│   └── web/                          # Next.js 14 App Router
│       ├── app/
│       │   ├── layout.tsx             # QueryClientProvider + SocketProvider
│       │   ├── page.tsx               # redirect → /tasks
│       │   ├── tasks/page.tsx
│       │   ├── repos/page.tsx
│       │   └── settings/page.tsx
│       ├── components/
│       │   ├── providers/
│       │   │   ├── query-provider.tsx  # 'use client'
│       │   │   └── socket-provider.tsx # 'use client', Socket.io context
│       │   ├── layout/
│       │   │   └── top-nav.tsx
│       │   ├── tasks/
│       │   │   ├── task-list.tsx       # 'use client'
│       │   │   ├── task-form.tsx       # 'use client'
│       │   │   └── log-viewer.tsx      # 'use client'
│       │   ├── repos/
│       │   │   └── repo-manager.tsx    # 'use client'
│       │   └── settings/
│       │       └── settings-form.tsx   # 'use client'
│       ├── hooks/
│       │   ├── use-tasks.ts
│       │   ├── use-repos.ts
│       │   └── use-task-log.ts
│       ├── lib/
│       │   ├── api.ts                  # typed fetch wrappers
│       │   ├── socket.ts               # socket.io-client singleton
│       │   └── query-client.ts
│       ├── next.config.ts
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   └── shared-types/
│       ├── src/index.ts               # types shared between api + web
│       └── package.json
│
├── docker-compose.yml
├── docker-compose.dev.yml
├── pnpm-workspace.yaml
└── package.json
```

---

## Shared Types (packages/shared-types/src/index.ts)

```typescript
export type TaskStatus = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED'
export type AgentType  = 'FEATURE' | 'BUGFIX' | 'SUPPORT' | 'IMPROVE'

export interface Task {
  id: string
  issueKey: string
  title: string
  repoId: string
  repo?: Repo
  agentType: AgentType
  status: TaskStatus
  round: number
  maxRounds: number
  log: string
  mrUrl?: string
  error?: string
  createdAt: string
  updatedAt: string
}

export interface Repo {
  id: string
  name: string
  path: string
  githubRepo: string   // "org/repo-name"
  description?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface TaskCompletePayload {
  status: 'done' | 'failed'
  mrUrl?: string
  filesChanged?: string[]
  notes: string
}

export interface ObserveResult {
  success: boolean
  errors: string[]
  mrUrl?: string
}

// WebSocket event shapes (server → client)
export interface WsLogEvent    { type: 'log';    taskId: string; line: string; timestamp: string }
export interface WsStatusEvent { type: 'status'; taskId: string; status: TaskStatus; round: number }
export type WsEvent = WsLogEvent | WsStatusEvent
```

---

## Prisma Schema (apps/api/prisma/schema.prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum TaskStatus {
  QUEUED
  RUNNING
  DONE
  FAILED
  CANCELLED
}

enum AgentType {
  FEATURE
  BUGFIX
  SUPPORT
  IMPROVE
}

model Task {
  id         String     @id @default(uuid()) @db.Uuid
  issueKey   String     @map("issue_key")
  title      String
  repoId     String     @map("repo_id") @db.Uuid
  repo       Repo       @relation(fields: [repoId], references: [id])
  agentType  AgentType  @default(FEATURE) @map("agent_type")
  status     TaskStatus @default(QUEUED)
  round      Int        @default(0)
  maxRounds  Int        @default(5) @map("max_rounds")
  log        String     @default("") @db.Text
  lastError  String?    @map("last_error") @db.Text
  mrUrl      String?    @map("mr_url")
  createdAt  DateTime   @default(now()) @map("created_at")
  updatedAt  DateTime   @updatedAt @map("updated_at")

  @@index([status])
  @@index([issueKey])
  @@index([repoId, status])
  @@map("tasks")
}

model Repo {
  id          String   @id @default(uuid()) @db.Uuid
  name        String   @unique
  path        String
  githubRepo  String   @map("github_repo")
  description String?
  active      Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  tasks       Task[]

  @@map("repos")
}

// Generic key-value store for all credentials + config
model Setting {
  key       String   @id
  value     String   @db.Text   // encrypted if encrypted=true
  encrypted Boolean  @default(false)
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("settings")
}
```

**Default setting keys**: `anthropic_api_key`, `jira_base_url`, `jira_email`, `jira_api_token`,
`github_token`, `poll_interval_ms`

**Keys encrypted at rest** (via `EncryptionService`): `anthropic_api_key`, `jira_api_token`, `github_token`

Run migrations with `pnpm prisma migrate dev` — never hand-edit the `migrations/` folder.

---

## NestJS Backend

### main.ts

```typescript
import { NestFactory }       from '@nestjs/core'
import { AppModule }         from './app.module'
import { ValidationPipe, VersioningType } from '@nestjs/common'
import { AllExceptionsFilter }  from './common/filters/all-exceptions.filter'
import { LoggingInterceptor }   from './common/interceptors/logging.interceptor'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { IoAdapter }            from '@nestjs/platform-socket.io'
import helmet from 'helmet'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })

  app.use(helmet())
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  })

  app.useWebSocketAdapter(new IoAdapter(app))
  app.setGlobalPrefix('api')
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))
  app.useGlobalFilters(new AllExceptionsFilter())
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor())

  app.enableShutdownHooks()  // triggers OnModuleDestroy on all providers

  await app.listen(process.env.PORT ?? 4000)
}
bootstrap()
```

### app.module.ts

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }),
    PrismaModule,
    TasksModule,
    ReposModule,
    SettingsModule,
    AgentsModule,
    QueueModule,
    LogsGatewayModule,
    JiraPollerModule,
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST'),
          port: config.get('REDIS_PORT'),
        },
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 200 },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*')
  }
}
```

### Configuration (common/config/configuration.ts)

```typescript
import { z } from 'zod'

const configSchema = z.object({
  PORT:           z.coerce.number().default(4000),
  NODE_ENV:       z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL:   z.string().url(),
  REDIS_HOST:     z.string().default('localhost'),
  REDIS_PORT:     z.coerce.number().default(6379),
  FRONTEND_URL:   z.string().url().default('http://localhost:3000'),
  ENCRYPTION_KEY: z.string().length(32), // openssl rand -hex 16
})

export type AppConfig = z.infer<typeof configSchema>

export function validateConfig(config: Record<string, unknown>): AppConfig {
  return configSchema.parse(config)
}
```

> `ENCRYPTION_KEY` is the **only** secret in `.env`. All API tokens live in the `settings` table
> encrypted with this key. Never add Jira/GitHub/Anthropic tokens to `.env`.

### EncryptionService (common/crypto/encryption.service.ts)

```typescript
@Injectable()
export class EncryptionService {
  private readonly key: Buffer

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.get<string>('ENCRYPTION_KEY'), 'hex')
  }

  encrypt(plain: string): string {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv)
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
  }

  decrypt(ciphertext: string): string {
    const [ivHex, tagHex, encHex] = ciphertext.split(':')
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return decipher.update(Buffer.from(encHex, 'hex'), undefined, 'utf8') + decipher.final('utf8')
  }
}
```

### SettingsService (modules/settings/settings.service.ts)

```typescript
@Injectable()
export class SettingsService {
  private readonly SENSITIVE = new Set(['anthropic_api_key', 'jira_api_token', 'github_token'])

  constructor(private prisma: PrismaService, private crypto: EncryptionService) {}

  async get(key: string): Promise<string | null> {
    const s = await this.prisma.setting.findUnique({ where: { key } })
    if (!s) return null
    return s.encrypted ? this.crypto.decrypt(s.value) : s.value
  }

  async upsert(key: string, value: string): Promise<void> {
    const shouldEncrypt = this.SENSITIVE.has(key)
    const stored = shouldEncrypt ? this.crypto.encrypt(value) : value
    await this.prisma.setting.upsert({
      where: { key },
      update:  { value: stored, encrypted: shouldEncrypt },
      create:  { key, value: stored, encrypted: shouldEncrypt },
    })
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.setting.findMany()
    return Object.fromEntries(
      rows.map(s => [s.key, s.encrypted ? this.crypto.decrypt(s.value) : s.value])
    )
  }

  /** Safe version for GET /api/v1/settings — masks sensitive values */
  async getAllMasked(): Promise<Record<string, string>> {
    const all = await this.getAll()
    return Object.fromEntries(
      Object.entries(all).map(([k, v]) =>
        [k, this.SENSITIVE.has(k) ? `${'*'.repeat(Math.max(v.length - 4, 4))}${v.slice(-4)}` : v]
      )
    )
  }
}
```

### DTOs

```typescript
// create-task.dto.ts
export class CreateTaskDto {
  @IsString() @IsNotEmpty() @MaxLength(50)
  issueKey: string

  @IsString() @IsNotEmpty() @MaxLength(500)
  title: string

  @IsUUID()
  repoId: string

  @IsEnum(['FEATURE', 'BUGFIX', 'SUPPORT', 'IMPROVE'])
  agentType: AgentType
}

// create-repo.dto.ts
export class CreateRepoDto {
  @IsString() @IsNotEmpty() @MaxLength(100)
  name: string

  @IsString() @IsNotEmpty()
  path: string                              // absolute path on host

  @Matches(/^[\w.-]+\/[\w.-]+$/)
  githubRepo: string                        // "org/repo"

  @IsOptional() @IsString() @MaxLength(300)
  description?: string
}
```

---

## Agent Plugin Pattern

### base-agent.ts

```typescript
export type SuccessCondition = 'mr_created' | 'ci_passed' | 'no_build_errors'

export abstract class BaseAgent {
  abstract readonly type: AgentType
  abstract readonly systemPrompt: string

  abstract getSuccessConditions(): SuccessCondition[]
  abstract buildUserPrompt(
    task: { issueKey: string; title: string },
    round: number,
    errorContext: string
  ): string
}
```

### feature.agent.ts

```typescript
@Injectable()
export class FeatureAgent extends BaseAgent {
  type = 'FEATURE' as const

  systemPrompt = `
You are a senior software engineer implementing features from Jira tickets.
You operate autonomously inside a git repository using the provided tools.

## Workflow
1. Read the Jira ticket details with execute_bash (use jira CLI or curl with JIRA_BASE_URL/JIRA_API_TOKEN env vars)
2. Explore the codebase: list_directory, read_file for relevant files
3. Create a feature branch: execute_bash "git checkout -b feature/<issue-key>"
4. Implement the feature following existing patterns
5. Write or update tests if a test framework is present
6. Run the build: execute_bash "npm run build" (or equivalent)
7. Fix all build/lint errors before continuing
8. Commit: execute_bash "git add -A && git commit -m 'feat(<issue-key>): <description>'"
9. Push: execute_bash "git push -u origin feature/<issue-key>"
10. Create a PR via GitHub API using GITHUB_TOKEN env var
11. Call complete_task with status="done" and the PR URL

## Rules
- Never modify files outside the repository root
- Follow existing code style — read files before writing them
- Commit incrementally, never in one giant commit
- If something is ambiguous, make a reasonable assumption and document it in the PR description
- Do not ask for approval — proceed autonomously
- If a step fails, fix it and retry before giving up
`.trim()

  getSuccessConditions(): SuccessCondition[] {
    return ['mr_created', 'ci_passed']
  }

  buildUserPrompt(task: { issueKey: string; title: string }, round: number, errorContext: string): string {
    const retry = round > 1
      ? `\n\n## RETRY ROUND ${round}\nPrevious attempt failed:\n${errorContext}\n\nCheck for existing branches first, then address the issues above.`
      : ''
    return `Implement the feature described in Jira ticket ${task.issueKey}: "${task.title}"${retry}`
  }
}
```

### bugfix.agent.ts

```typescript
@Injectable()
export class BugfixAgent extends BaseAgent {
  type = 'BUGFIX' as const

  systemPrompt = `
You are an expert debugging engineer. You investigate and fix bugs reported in Jira.

## Workflow
1. Read the bug report details from Jira
2. Reproduce the issue: read relevant code, run tests, check logs
3. Identify root cause — read_file and execute_bash to trace the issue
4. Create a fix branch: git checkout -b fix/<issue-key>
5. Apply the minimal fix that addresses the root cause
6. Add a regression test
7. Run full test suite: confirm it passes
8. Commit, push, and create a PR
9. Call complete_task

## Rules
- Fix the root cause, not just the symptom
- Regression tests are mandatory for every bug fix
- Keep changes minimal and focused
`.trim()

  getSuccessConditions(): SuccessCondition[] {
    return ['mr_created', 'ci_passed', 'no_build_errors']
  }

  buildUserPrompt(task: { issueKey: string; title: string }, round: number, errorContext: string): string {
    const retry = round > 1 ? `\n\n## RETRY ROUND ${round}\n${errorContext}` : ''
    return `Investigate and fix the bug reported in ${task.issueKey}: "${task.title}"${retry}`
  }
}
```

### improve.agent.ts

```typescript
@Injectable()
export class ImproveAgent extends BaseAgent {
  type = 'IMPROVE' as const

  systemPrompt = `
You are a code quality engineer focused on refactoring and performance improvements.

## Workflow
1. Understand the improvement target from the ticket
2. Analyse current implementation
3. Apply improvements: refactor, optimise, add types, improve error handling
4. Ensure all existing tests still pass
5. Update or add documentation if relevant
6. Commit and push on a branch
7. Call complete_task (no PR required — direct push to feat branch is acceptable)

## Rules
- Do not change external behaviour — only internal implementation
- Run tests before and after every change
`.trim()

  getSuccessConditions(): SuccessCondition[] {
    return ['no_build_errors']  // no PR required for improvements
  }

  buildUserPrompt(task: { issueKey: string; title: string }, round: number, errorContext: string): string {
    const retry = round > 1 ? `\n\n## RETRY ROUND ${round}\n${errorContext}` : ''
    return `Apply code improvements as described in ${task.issueKey}: "${task.title}"${retry}`
  }
}
```

### agent.registry.ts

```typescript
@Injectable()
export class AgentRegistry {
  constructor(
    private feature: FeatureAgent,
    private bugfix:  BugfixAgent,
    private support: SupportAgent,
    private improve: ImproveAgent,
  ) {}

  get(type: AgentType): BaseAgent {
    const map: Record<AgentType, BaseAgent> = {
      FEATURE: this.feature,
      BUGFIX:  this.bugfix,
      SUPPORT: this.support,
      IMPROVE: this.improve,
    }
    if (!map[type]) throw new Error(`Unknown agent type: ${type}`)
    return map[type]
  }

  getTypes(): AgentType[] {
    return Object.keys(this.get.length ? {} : {
      FEATURE: 1, BUGFIX: 1, SUPPORT: 1, IMPROVE: 1
    }) as AgentType[]
  }
}
```

---

## Claude SDK Agent Engine

### Tool Definitions (workers/agent-tools.ts)

The `complete_task` tool replaces FOREMAN_SUMMARY text parsing entirely.
Environment variables `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `GITHUB_TOKEN`,
`ANTHROPIC_API_KEY` are injected into the `execute_bash` environment so Claude can use them
in curl/gh CLI commands.

```typescript
import type { Tool } from '@anthropic-ai/sdk/resources/messages'

export const AGENT_TOOLS: Tool[] = [
  {
    name: 'execute_bash',
    description: 'Run a shell command in the repository root. Use for git, npm/yarn, curl, tests, builds, etc. Environment variables JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, GITHUB_TOKEN are pre-set.',
    input_schema: {
      type: 'object',
      properties: {
        command:    { type: 'string', description: 'Shell command to run' },
        timeout_ms: { type: 'number', description: 'Timeout milliseconds (default 60000, max 300000)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description: 'Read contents of a file relative to the repo root.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to repo root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a file relative to the repo root. Creates parent directories if needed.',
    input_schema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'File path relative to repo root' },
        content: { type: 'string', description: 'Full file content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and subdirectories at a given path relative to repo root.',
    input_schema: {
      type: 'object',
      properties: {
        path:      { type: 'string', description: 'Directory path (default ".")' },
        recursive: { type: 'boolean', description: 'Whether to recurse (default false)' },
      },
      required: [],
    },
  },
  {
    name: 'complete_task',
    description: 'Signal that the task is complete. This MUST be your last action in every run — success or failure.',
    input_schema: {
      type: 'object',
      properties: {
        status:        { type: 'string', enum: ['done', 'failed'] },
        mr_url:        { type: 'string', description: 'Pull request URL if created' },
        files_changed: { type: 'array', items: { type: 'string' }, description: 'Changed file paths' },
        notes:         { type: 'string', description: 'Summary of what was done or why it failed' },
      },
      required: ['status', 'notes'],
    },
  },
]
```

### ToolExecutorService (workers/tool-executor.service.ts)

```typescript
@Injectable()
export class ToolExecutorService {
  /** Commands that could cause irreversible system damage */
  private readonly BLOCKED = [
    /rm\s+-rf\s+\//,
    /mkfs/,
    /dd\s+if=/,
    />\s*\/dev\/sd/,
    /curl[^|]+\|\s*(ba)?sh/,
    /wget[^|]+\|\s*(ba)?sh/,
  ]

  async execute(
    name: string,
    input: Record<string, unknown>,
    repoPath: string,
    env: Record<string, string>,
    onLog: (line: string) => void,
  ): Promise<string> {
    switch (name) {
      case 'execute_bash':   return this.bash(input as BashInput, repoPath, env, onLog)
      case 'read_file':      return this.readFile(input as { path: string }, repoPath)
      case 'write_file':     return this.writeFile(input as WriteFileInput, repoPath, onLog)
      case 'list_directory': return this.listDir(input as { path?: string; recursive?: boolean }, repoPath)
      case 'complete_task':  return JSON.stringify(input)  // caller handles this
      default: throw new Error(`Unknown tool: ${name}`)
    }
  }

  private async bash(
    input: BashInput,
    repoPath: string,
    env: Record<string, string>,
    onLog: (l: string) => void,
  ): Promise<string> {
    if (this.BLOCKED.some(p => p.test(input.command))) {
      throw new Error(`Blocked dangerous command: ${input.command}`)
    }
    const timeout = Math.min(input.timeout_ms ?? 60_000, 300_000)
    return new Promise((resolve, reject) => {
      const proc = spawn('bash', ['-c', input.command], {
        cwd: repoPath,
        env: { ...process.env, ...env },
        timeout,
      })
      const output: string[] = []
      proc.stdout.on('data', (d: Buffer) => { const l = d.toString(); output.push(l); onLog(l) })
      proc.stderr.on('data', (d: Buffer) => { const l = d.toString(); output.push(l); onLog(l) })
      proc.on('close', code => {
        const result = output.join('')
        code === 0 ? resolve(result) : reject(new Error(`Exit ${code}: ${result.slice(-500)}`))
      })
      proc.on('error', reject)
    })
  }

  private resolveSafe(repoPath: string, relativePath: string): string {
    const resolved = path.resolve(repoPath, relativePath)
    if (!resolved.startsWith(path.resolve(repoPath) + path.sep) && resolved !== path.resolve(repoPath)) {
      throw new Error(`Path traversal blocked: ${relativePath}`)
    }
    return resolved
  }

  private async readFile(input: { path: string }, repoPath: string): Promise<string> {
    return fs.readFile(this.resolveSafe(repoPath, input.path), 'utf-8')
  }

  private async writeFile(input: WriteFileInput, repoPath: string, onLog: (l: string) => void): Promise<string> {
    const full = this.resolveSafe(repoPath, input.path)
    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, input.content, 'utf-8')
    onLog(`[write_file] ${input.path}`)
    return `Written: ${input.path}`
  }

  private async listDir(input: { path?: string; recursive?: boolean }, repoPath: string): Promise<string> {
    const target = this.resolveSafe(repoPath, input.path ?? '.')
    const entries = await fs.readdir(target, { withFileTypes: true })
    return entries.map(e => `${e.isDirectory() ? '[dir] ' : ''}${e.name}`).join('\n')
  }
}
```

### ClaudeRunnerService (workers/claude-runner.service.ts)

Core change from the original prompt: uses the Anthropic SDK streaming API with a tool-use
agentic loop. No subprocess spawning, no text-parsing, no FOREMAN_SUMMARY.

```typescript
@Injectable()
export class ClaudeRunnerService {
  private client: Anthropic | null = null

  constructor(
    private settings: SettingsService,
    private toolExecutor: ToolExecutorService,
    private logsGateway: LogsGateway,
    private logger: Logger,
  ) {}

  async run(
    task: Task & { repo: Repo },
    agent: BaseAgent,
    round: number,
    errorContext: string,
    signal: AbortSignal,
  ): Promise<TaskCompletePayload> {
    // Fetch credentials fresh per run (user may have updated them)
    const apiKey = await this.settings.get('anthropic_api_key')
    if (!apiKey) throw new Error('anthropic_api_key not configured in Settings')

    // Env vars injected into every execute_bash call
    const toolEnv: Record<string, string> = {
      JIRA_BASE_URL:   (await this.settings.get('jira_base_url'))   ?? '',
      JIRA_EMAIL:      (await this.settings.get('jira_email'))       ?? '',
      JIRA_API_TOKEN:  (await this.settings.get('jira_api_token'))   ?? '',
      GITHUB_TOKEN:    (await this.settings.get('github_token'))     ?? '',
    }

    const emit = (line: string) => this.logsGateway.emitLog(task.id, line)

    // Lazily create client (or recreate if apiKey changed)
    this.client = new Anthropic({ apiKey })

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: agent.buildUserPrompt({ issueKey: task.issueKey, title: task.title }, round, errorContext),
      },
    ]

    const MAX_TURNS = 80

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (signal.aborted) throw new Error('Task cancelled')

      // Stream with real-time text forwarding
      const stream = this.client.messages.stream({
        model:      'claude-opus-4-5',
        max_tokens: 8192,
        system:     agent.systemPrompt,
        tools:      AGENT_TOOLS,
        messages,
      })

      stream.on('text', emit)

      const response = await stream.finalMessage()

      // Collect tool_use blocks
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )

      // Check for complete_task
      const completeBlock = toolUseBlocks.find(b => b.name === 'complete_task')
      if (completeBlock) {
        return completeBlock.input as TaskCompletePayload
      }

      // Agent said end_turn with no tool calls — something went wrong
      if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        return { status: 'failed', notes: 'Claude ended turn without calling complete_task' }
      }

      // Execute each tool call and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const tb of toolUseBlocks) {
        emit(`\n[tool:${tb.name}] ${JSON.stringify(tb.input)}\n`)
        try {
          const result = await this.toolExecutor.execute(
            tb.name,
            tb.input as Record<string, unknown>,
            task.repo.path,
            toolEnv,
            emit,
          )
          toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: result })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          emit(`[tool:${tb.name}] ERROR: ${msg}\n`)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tb.id,
            content: `ERROR: ${msg}`,
            is_error: true,
          })
        }
      }

      // Append exchange to conversation history
      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user',      content: toolResults })
    }

    return { status: 'failed', notes: `Max turns (${MAX_TURNS}) reached without complete_task` }
  }
}
```

### AgentLoopService (workers/agent-loop.service.ts)

```typescript
@Injectable()
export class AgentLoopService {
  constructor(
    private tasksService: TasksService,
    private claudeRunner: ClaudeRunnerService,
    private observer: ObserverService,
    private logsGateway: LogsGateway,
  ) {}

  async run(task: Task & { repo: Repo }, agent: BaseAgent): Promise<void> {
    await this.tasksService.setStatus(task.id, 'RUNNING')

    for (let round = 1; round <= task.maxRounds; round++) {
      await this.tasksService.setRound(task.id, round)
      this.logsGateway.emitStatus(task.id, 'RUNNING', round)
      this.logsGateway.emitLog(task.id, `━━━ Round ${round}/${task.maxRounds} ━━━`)

      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 30 * 60 * 1000)  // 30 min per round

      let payload: TaskCompletePayload
      try {
        const errorContext = round > 1 ? (task.lastError ?? '') : ''
        payload = await this.claudeRunner.run(task, agent, round, errorContext, ac.signal)
      } catch (err) {
        clearTimeout(timer)
        const msg = err instanceof Error ? err.message : String(err)
        await this.tasksService.appendLog(task.id, `[ROUND ${round} ERROR] ${msg}`)
        await this.tasksService.setLastError(task.id, msg)
        continue
      } finally {
        clearTimeout(timer)
      }

      await this.tasksService.appendLog(task.id, `[ROUND ${round}] ${payload.notes}`)

      if (payload.status === 'done') {
        const observed = await this.observer.check(task, payload.mrUrl, agent.getSuccessConditions())

        if (observed.success) {
          await this.tasksService.complete(task.id, observed.mrUrl)
          this.logsGateway.emitStatus(task.id, 'DONE', round)
          return
        }

        const errMsg = observed.errors.join('\n')
        await this.tasksService.appendLog(task.id, `[OBSERVE FAILED]\n${errMsg}`)
        await this.tasksService.setLastError(task.id, errMsg)
      } else {
        await this.tasksService.setLastError(task.id, payload.notes)
      }
    }

    await this.tasksService.fail(task.id, `Max rounds (${task.maxRounds}) exhausted`)
    this.logsGateway.emitStatus(task.id, 'FAILED', task.maxRounds)
  }
}
```

---

## BullMQ Queue

### queue.module.ts

```typescript
export const TASK_QUEUE = 'task-queue'

@Module({
  imports: [
    BullModule.registerQueue({ name: TASK_QUEUE }),
    AgentsModule,
    WorkersModule,
  ],
  providers: [TaskProcessor, TaskQueueService],
  exports: [TaskQueueService],
})
export class QueueModule {}
```

### task.processor.ts

```typescript
@Processor(TASK_QUEUE, { concurrency: 1 })
export class TaskProcessor extends WorkerHost {
  constructor(
    private tasks: TasksService,
    private registry: AgentRegistry,
    private agentLoop: AgentLoopService,
  ) { super() }

  async process(job: Job<{ taskId: string }>): Promise<void> {
    const task = await this.tasks.findByIdWithRepo(job.data.taskId)
    if (!task) throw new Error(`Task ${job.data.taskId} not found`)
    const agent = this.registry.get(task.agentType)
    await this.agentLoop.run(task, agent)
  }
}
```

### task-queue.service.ts

Per-repo concurrency = 1 is enforced by BullMQ job groups.
Job ID = task UUID → idempotent: calling enqueue twice does nothing.

```typescript
@Injectable()
export class TaskQueueService {
  constructor(@InjectQueue(TASK_QUEUE) private queue: Queue) {}

  async enqueue(task: Task): Promise<void> {
    await this.queue.add(
      'run-task',
      { taskId: task.id },
      {
        jobId:           task.id,         // idempotent
        group:           { id: task.repoId, concurrency: 1 },  // per-repo serialisation
        attempts:        1,               // retries handled inside AgentLoopService
        removeOnComplete: true,
        removeOnFail:     false,
      },
    )
  }

  async cancel(taskId: string): Promise<void> {
    const job = await this.queue.getJob(taskId)
    await job?.remove()
  }
}
```

---

## Socket.io Gateway (gateways/logs.gateway.ts)

```typescript
@WebSocketGateway({
  cors:      { origin: process.env.FRONTEND_URL ?? 'http://localhost:3000' },
  namespace: '/logs',
})
export class LogsGateway {
  @WebSocketServer() server: Server

  emitLog(taskId: string, line: string): void {
    this.server.to(`task:${taskId}`).emit('log', {
      type:      'log',
      taskId,
      line,
      timestamp: new Date().toISOString(),
    } satisfies WsLogEvent)
  }

  emitStatus(taskId: string, status: TaskStatus, round: number): void {
    this.server.to(`task:${taskId}`).emit('status', {
      type: 'status', taskId, status, round,
    } satisfies WsStatusEvent)
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(@ConnectedSocket() client: Socket, @MessageBody() data: { taskId: string }) {
    client.join(`task:${data.taskId}`)
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(@ConnectedSocket() client: Socket, @MessageBody() data: { taskId: string }) {
    client.leave(`task:${data.taskId}`)
  }
}
```

---

## Observer Service (workers/observer.service.ts)

```typescript
@Injectable()
export class ObserverService {
  async check(
    task: Task & { repo: Repo },
    mrUrl: string | undefined,
    conditions: SuccessCondition[],
  ): Promise<ObserveResult> {
    const errors: string[] = []
    let resolvedUrl = mrUrl

    for (const cond of conditions) {
      switch (cond) {
        case 'mr_created': {
          const pr = await this.github.findPRByBranch(
            task.repo.githubRepo,
            `feature/${task.issueKey}`,
          ).catch(() => null)
          if (!pr) {
            errors.push(`No PR found for branch feature/${task.issueKey}`)
          } else {
            resolvedUrl = pr.html_url
          }
          break
        }

        case 'ci_passed': {
          if (!resolvedUrl) { errors.push('Cannot check CI: no PR URL'); break }
          const passed = await this.github.waitForCI(resolvedUrl, {
            pollIntervalMs: 30_000,
            timeoutMs:      600_000,  // 10 minutes
          })
          if (!passed) errors.push('CI checks failed or timed out')
          break
        }

        case 'no_build_errors': {
          try {
            await this.toolExecutor.execute(
              'execute_bash',
              { command: 'npm run build --if-present' },
              task.repo.path,
              {},
              () => {},
            )
          } catch {
            errors.push('Build check failed in repo')
          }
          break
        }
      }
    }

    return { success: errors.length === 0, errors, mrUrl: resolvedUrl }
  }
}
```

---

## Jira Poller (triggers/jira-poller.service.ts)

Key improvement over original: deduplication is backed by DB on startup, not an in-memory Set
that resets on restart.

```typescript
@Injectable()
export class JiraPollerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null
  private enqueuedKeys = new Set<string>()

  async onModuleInit(): Promise<void> {
    // Restore deduplication state from DB — survives restarts
    const active = await this.tasks.findByStatuses(['QUEUED', 'RUNNING'])
    active.forEach(t => this.enqueuedKeys.add(t.issueKey))
    this.scheduleNext()
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer)
  }

  private async scheduleNext(): Promise<void> {
    const ms = Number(await this.settings.get('poll_interval_ms')) || 60_000
    this.timer = setTimeout(async () => {
      await this.poll().catch(err =>
        this.logger.error('Jira poll cycle failed', { error: err.message })
      )
      this.scheduleNext()  // re-read interval each cycle so UI changes take effect
    }, ms)
  }

  private async poll(): Promise<void> {
    const token = await this.settings.get('jira_api_token')
    if (!token) return  // silently skip if not configured

    const issues = await this.jira.searchIssues(
      'project in (MAH, MIDA) AND status = "To Do" AND assignee = currentUser()'
    )

    for (const issue of issues) {
      if (this.enqueuedKeys.has(issue.key)) continue

      const agentType = this.detectAgentType(issue.fields.labels)
      const repo = await this.detectRepo(issue.fields.labels)

      if (!repo) {
        this.logger.warn(`No repo found for ${issue.key} — skipping`, { labels: issue.fields.labels })
        continue
      }

      const task = await this.tasks.create({
        issueKey: issue.key,
        title: issue.fields.summary,
        repoId: repo.id,
        agentType,
      })

      await this.queue.enqueue(task)
      this.enqueuedKeys.add(issue.key)
      this.logger.log(`Enqueued ${issue.key} as ${agentType} in repo ${repo.name}`)
    }
  }

  private detectAgentType(labels: string[]): AgentType {
    if (labels.includes('agent:bugfix'))  return 'BUGFIX'
    if (labels.includes('agent:support')) return 'SUPPORT'
    if (labels.includes('agent:improve')) return 'IMPROVE'
    return 'FEATURE'
  }

  private async detectRepo(labels: string[]): Promise<Repo | null> {
    const label = labels.find(l => l.startsWith('repo:'))
    if (!label) return null
    return this.reposService.findByName(label.slice(5))
  }
}
```

---

## API Routes

All routes are prefixed `/api/v1/` and protected by `ApiKeyGuard`
(reads `X-API-Key` header; key stored in settings as `api_key`).
Exception: `GET /health` has no prefix and no auth guard.

### Tasks
```
GET    /api/v1/tasks              ?status=RUNNING&agentType=FEATURE&page=1&limit=20
GET    /api/v1/tasks/:id          full task with log
POST   /api/v1/tasks              CreateTaskDto → creates + enqueues immediately
DELETE /api/v1/tasks/:id          cancels if QUEUED (sets status=CANCELLED + removes BullMQ job)
```

### Repos
```
GET    /api/v1/repos
POST   /api/v1/repos              CreateRepoDto
PUT    /api/v1/repos/:id          UpdateRepoDto (partial)
DELETE /api/v1/repos/:id          404 if active tasks exist on this repo
POST   /api/v1/repos/:id/verify   → { valid, checks: { pathExists, isGitRepo, hasNodeModules, anthropicApiKeyConfigured } }
```

### Settings
```
GET    /api/v1/settings           masked response (tokens replaced with ****)
PUT    /api/v1/settings           { key: value, ... } — upsert multiple, encrypts sensitive keys
```

### Agent Types
```
GET    /api/v1/agent-types        → ['FEATURE', 'BUGFIX', 'SUPPORT', 'IMPROVE']
```

### Health
```
GET    /health                    → { status: 'ok'|'degraded', database: 'ok'|'error', redis: 'ok'|'error', uptime: number }
```

---

## Next.js Frontend (App Router)

### next.config.ts

Proxy all `/api/*` to the NestJS backend — no CORS required in production.

```typescript
const config: NextConfig = {
  async rewrites() {
    return [{
      source: '/api/:path*',
      destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`,
    }]
  },
}
export default config
```

### root layout (app/layout.tsx)

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <SocketProvider>
            <TopNav />
            <main className="flex flex-col h-[calc(100vh-56px)]">{children}</main>
          </SocketProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
```

### SocketProvider (components/providers/socket-provider.tsx)

```tsx
'use client'
const SocketContext = createContext<Socket | null>(null)

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket] = useState(() =>
    io(`${process.env.NEXT_PUBLIC_API_URL}/logs`, {
      autoConnect: true,
      transports: ['websocket'],
    })
  )
  useEffect(() => () => { socket.disconnect() }, [socket])
  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
}

export const useSocket = () => {
  const s = useContext(SocketContext)
  if (!s) throw new Error('useSocket must be used inside SocketProvider')
  return s
}
```

### useTaskLog hook (hooks/use-task-log.ts)

```typescript
'use client'
export function useTaskLog(taskId: string | null): string[] {
  const socket = useSocket()
  const [lines, setLines] = useState<string[]>([])

  // Load existing log on task select
  useEffect(() => {
    if (!taskId) { setLines([]); return }
    fetch(`/api/v1/tasks/${taskId}`)
      .then(r => r.json())
      .then(({ data }) => setLines((data.log as string).split('\n').filter(Boolean)))
  }, [taskId])

  // Live stream via Socket.io
  useEffect(() => {
    if (!taskId) return
    socket.emit('subscribe', { taskId })
    const onLog = (evt: WsLogEvent) => {
      if (evt.taskId === taskId) setLines(prev => [...prev, evt.line])
    }
    socket.on('log', onLog)
    return () => {
      socket.emit('unsubscribe', { taskId })
      socket.off('log', onLog)
    }
  }, [taskId, socket])

  return lines
}
```

### useTasks hook (hooks/use-tasks.ts)

```typescript
'use client'
export function useTasks() {
  return useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn:  () => fetch('/api/v1/tasks').then(r => r.json()).then(r => r.data),
    refetchInterval: 3_000,
    staleTime: 0,
  })
}
```

### Tasks Page layout (app/tasks/page.tsx)

```tsx
'use client'
export default function TasksPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <div className="flex h-full overflow-hidden gap-4 p-4">
      {/* Left panel — fixed width */}
      <div className="w-80 flex flex-col gap-4 overflow-hidden">
        <TaskForm onCreated={setSelectedId} />
        <TaskList selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      {/* Right panel — fills remaining space */}
      <div className="flex-1 overflow-hidden">
        <LogViewer taskId={selectedId} />
      </div>
    </div>
  )
}
```

### LogViewer (components/tasks/log-viewer.tsx)

```tsx
'use client'
export function LogViewer({ taskId }: { taskId: string | null }) {
  const lines = useTaskLog(taskId)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  if (!taskId) {
    return (
      <div className="flex items-center justify-center h-full rounded-lg border border-dashed text-muted-foreground text-sm">
        Select a task to view logs
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto rounded-lg bg-[#0d1117] p-4 font-mono text-xs text-[#c9d1d9]">
      {lines.map((line, i) => (
        <div
          key={i}
          className={
            line.startsWith('━━━')        ? 'text-blue-400 font-semibold my-2' :
            line.startsWith('[tool:')     ? 'text-amber-400' :
            line.startsWith('[ERROR]')    ? 'text-red-400' :
            line.startsWith('[OBSERVE')   ? 'text-yellow-300' :
            ''
          }
        >
          {line}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
```

### TaskList (components/tasks/task-list.tsx)

```tsx
// Columns: issue_key | title | repo | agent type badge | status badge | round (2/5) | time ago
// Status badge colors: QUEUED=gray, RUNNING=blue pulse, DONE=green, FAILED=red, CANCELLED=slate
// Agent type badge colors: FEATURE=purple, BUGFIX=red, SUPPORT=teal, IMPROVE=amber
// Click row → setSelectedId
// Auto-refresh every 3s via useTasks
```

### RepoManager (components/repos/repo-manager.tsx)

After adding a repo, immediately call `POST /api/v1/repos/:id/verify` and display inline badge results:
`Path exists ✓/✗ | Git repo ✓/✗ | Node modules ✓/✗ | API key configured ✓/✗`

### SettingsForm (components/settings/settings-form.tsx)

Fields: Anthropic API Key (password), Jira Base URL, Jira Email, Jira API Token (password),
GitHub Token (password), Poll Interval (ms).
Submit → `PUT /api/v1/settings`. Show masked current values.
Status pills: "Anthropic configured ✓", "Jira configured ✓", "GitHub configured ✓".

---

## Docker & Deployment

### docker-compose.yml

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: foreman
      POSTGRES_USER: foreman
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U foreman"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s

  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: postgresql://foreman:${POSTGRES_PASSWORD}@postgres:5432/foreman
      REDIS_HOST: redis
      REDIS_PORT: 6379
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      FRONTEND_URL: http://localhost:3000
      PORT: 4000
    volumes:
      # Mount local repos (read-write for agent to modify files)
      - ${REPOS_BASE_PATH:-/home/user/repos}:/repos
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    ports:
      - "4000:4000"

  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:4000
    depends_on:
      - api
    ports:
      - "3000:3000"

volumes:
  postgres_data:
  redis_data:
```

### apps/api/Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm prisma generate
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
# Run migrations then start
CMD ["sh", "-c", "node -e \"require('./dist/main')\" & sleep 2 && node_modules/.bin/prisma migrate deploy && wait"]
```

Actually: run migrations as a pre-start script, not concurrently. Use `prisma migrate deploy` in
entrypoint before starting the server.

---

## Coding Standards

- **No `any`** — all types in `packages/shared-types` or explicit inline annotations
- **Zod** for all env config validation (`validateConfig` in `configuration.ts`)
- **class-validator DTOs** for all incoming HTTP request bodies; `ValidationPipe` rejects unknown fields
- **All Prisma access** inside module `*.service.ts` only — no raw SQL anywhere
- **All external API calls** in `src/integrations/*.ts` only
- **All credential access** via `SettingsService.get()` — never read env vars for tokens
- **Logger**: use NestJS `Logger` with context string, e.g. `new Logger('AgentLoopService')`
  Format: `[ClassName] message { meta object }`
- **Errors wrap cause**: `throw new Error(\`findPR failed for ${issueKey}: ${cause.message}\`)`
- **No console.log** — use NestJS Logger
- **Graceful shutdown**: implement `OnModuleDestroy` on all services with open connections or timers
- **All async paths** have try/catch with structured error logging
- **TransformInterceptor** wraps all success responses: `{ data: T, meta?: { total, page } }`
- **AllExceptionsFilter** returns `{ error: string, message: string, statusCode: number }`

---

## .env.example

```env
# ── Required ──────────────────────────────────────────
DATABASE_URL=postgresql://foreman:changeme@localhost:5432/foreman
REDIS_HOST=localhost
REDIS_PORT=6379

# 32-byte hex key for AES-256-GCM credential encryption
# Generate: openssl rand -hex 16
ENCRYPTION_KEY=00000000000000000000000000000000

# ── Optional ──────────────────────────────────────────
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# ── Docker ────────────────────────────────────────────
POSTGRES_PASSWORD=changeme
REPOS_BASE_PATH=/home/user/repos

# ── Frontend ──────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:4000
```

All Jira, GitHub, and Anthropic credentials are configured through the Settings UI
and stored encrypted in PostgreSQL — never in `.env`.
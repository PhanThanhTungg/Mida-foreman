# Phase 4: Worker Engine (AI Core) — Foreman

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the BullMQ job processor, tool executor (6 tools), Claude SDK agentic loop, per-repo Redis lock, and the retry-loop that drives each task through up to `maxRounds`.

**Architecture:** `WorkersModule` registers a BullMQ queue (`foreman-tasks`) and a `Processor`. When a task job lands, `TaskProcessorService` acquires a per-repo Redis lock (SETNX TTL 30 min), runs `ClaudeRunnerService` which drives the Claude SDK agentic loop calling `ToolExecutorService` for each tool use. On success-condition pass, task → `done`; on loop exhaustion, next round starts. After `maxRounds` failures, task → `failed`. `GatewayModule` is used to emit WebSocket log/status lines (imported from Phase 5, but a stub suffices here until Phase 5 is done).

**Tech Stack:** `@nestjs/bull`, `bullmq`, `ioredis`, `@anthropic-ai/sdk`, NestJS 10+

**Prerequisite:** Phase 3 complete (TasksModule, AgentsModule, SettingsModule wired). Phase 5 (GatewayModule) can be a stub until completed.

---

## File Structure

```
foreman/apps/api/src/
├── workers/
│   ├── workers.module.ts
│   ├── task.processor.ts           # BullMQ @Processor — drives retry loop
│   ├── claude-runner.service.ts    # Anthropic SDK agentic tool-use loop
│   ├── repo-lock.service.ts        # Redis SETNX per-repo lock
│   ├── tool-executor.service.ts    # Executes all 6 tool types
│   ├── success-observer.service.ts # Checks success conditions post-run
│   ├── task.processor.spec.ts
│   ├── tool-executor.service.spec.ts
│   └── repo-lock.service.spec.ts
└── tasks/
    └── orchestrator.service.ts     # REPLACE stub — inject BullMQ queue
```

Also modify:
- `foreman/apps/api/src/app.module.ts` — import `WorkersModule`
- `foreman/apps/api/src/tasks/tasks.module.ts` — import `BullModule` for queue

---

### Task 1: BullMQ Setup + WorkersModule Scaffold

**Files:**
- Create: `foreman/apps/api/src/workers/workers.module.ts`
- Modify: `foreman/apps/api/src/tasks/orchestrator.service.ts` — replace stub with real BullMQ enqueue
- Modify: `foreman/apps/api/src/tasks/tasks.module.ts` — register BullMQ queue
- Modify: `foreman/apps/api/src/app.module.ts` — import `WorkersModule`

**Interfaces:**
- Consumes: Redis URL from `process.env.REDIS_URL`
- Produces:
  - BullMQ queue named `'foreman-tasks'` accessible via `@InjectQueue('foreman-tasks')`
  - `OrchestratorService.enqueue(taskId)` adds job `{ taskId }` to the queue

- [ ] **Step 1: Write failing test for updated OrchestratorService**

```typescript
// foreman/apps/api/src/tasks/orchestrator.service.spec.ts
import { Test } from '@nestjs/testing';
import { OrchestratorService } from './orchestrator.service';
import { getQueueToken } from '@nestjs/bull';

const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

describe('OrchestratorService', () => {
  let service: OrchestratorService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrchestratorService,
        { provide: getQueueToken('foreman-tasks'), useValue: mockQueue },
      ],
    }).compile();
    service = module.get(OrchestratorService);
    jest.clearAllMocks();
  });

  it('adds a job to the foreman-tasks queue', async () => {
    await service.enqueue('task-abc');
    expect(mockQueue.add).toHaveBeenCalledWith(
      'process-task',
      { taskId: 'task-abc' },
      { attempts: 1, removeOnComplete: true, removeOnFail: false },
    );
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd foreman
pnpm --filter @foreman/api test -- --testPathPattern="orchestrator.service" --watchAll=false
```
Expected: FAIL

- [ ] **Step 3: Replace orchestrator.service.ts with BullMQ implementation**

```typescript
// foreman/apps/api/src/tasks/orchestrator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(@InjectQueue('foreman-tasks') private readonly queue: Queue) {}

  async enqueue(taskId: string): Promise<void> {
    await this.queue.add(
      'process-task',
      { taskId },
      { attempts: 1, removeOnComplete: true, removeOnFail: false },
    );
    this.logger.log(`Task ${taskId} added to foreman-tasks queue`);
  }
}
```

- [ ] **Step 4: Update tasks.module.ts to register BullMQ queue**

```typescript
// foreman/apps/api/src/tasks/tasks.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { OrchestratorService } from './orchestrator.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'foreman-tasks' })],
  controllers: [TasksController],
  providers: [TasksService, OrchestratorService],
  exports: [OrchestratorService],
})
export class TasksModule {}
```

- [ ] **Step 5: Create workers.module.ts**

```typescript
// foreman/apps/api/src/workers/workers.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TaskProcessor } from './task.processor';
import { ClaudeRunnerService } from './claude-runner.service';
import { ToolExecutorService } from './tool-executor.service';
import { RepoLockService } from './repo-lock.service';
import { SuccessObserverService } from './success-observer.service';
import { ReposModule } from '../repos/repos.module';
import { SettingsModule } from '../settings/settings.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'foreman-tasks' }),
    ReposModule,
    SettingsModule,
    AgentsModule,
  ],
  providers: [
    TaskProcessor,
    ClaudeRunnerService,
    ToolExecutorService,
    RepoLockService,
    SuccessObserverService,
  ],
})
export class WorkersModule {}
```

- [ ] **Step 6: Update app.module.ts to add BullModule.forRoot + WorkersModule**

```typescript
// foreman/apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { ReposModule } from './repos/repos.module';
import { SettingsModule } from './settings/settings.module';
import { TasksModule } from './tasks/tasks.module';
import { AgentsModule } from './agents/agents.module';
import { WorkersModule } from './workers/workers.module';
import { ApiKeyGuard } from './common/guards/api-key.guard';

@Module({
  imports: [
    BullModule.forRoot({ redis: process.env.REDIS_URL ?? 'redis://localhost:6379' }),
    PrismaModule,
    HealthModule,
    ReposModule,
    SettingsModule,
    TasksModule,
    AgentsModule,
    WorkersModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AppModule {}
```

- [ ] **Step 7: Run orchestrator test to confirm pass**

```bash
cd foreman
pnpm --filter @foreman/api test -- --testPathPattern="orchestrator.service" --watchAll=false
```
Expected: PASS — 1 test passes

- [ ] **Step 8: Commit**

```bash
cd foreman
git add apps/api/src/workers/workers.module.ts apps/api/src/tasks/ apps/api/src/app.module.ts
git commit -m "feat(workers): set up BullMQ queue and WorkersModule scaffold"
```

---

### Task 2: RepoLockService — Redis SETNX Per-Repo Lock

**Files:**
- Create: `foreman/apps/api/src/workers/repo-lock.service.ts`
- Test: `foreman/apps/api/src/workers/repo-lock.service.spec.ts`

**Interfaces:**
- Produces:
  - `RepoLockService.acquire(repoId: string): Promise<boolean>` — `SET repo:lock:{repoId} 1 EX 1800 NX`; returns `true` if lock acquired
  - `RepoLockService.release(repoId: string): Promise<void>` — `DEL repo:lock:{repoId}`

- [ ] **Step 1: Write failing test**

```typescript
// foreman/apps/api/src/workers/repo-lock.service.spec.ts
import { Test } from '@nestjs/testing';
import { RepoLockService } from './repo-lock.service';

const mockRedis = { set: jest.fn(), del: jest.fn() };

describe('RepoLockService', () => {
  let service: RepoLockService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RepoLockService,
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();
    service = module.get(RepoLockService);
    jest.clearAllMocks();
  });

  it('acquire returns true when SET NX succeeds', async () => {
    mockRedis.set.mockResolvedValue('OK');
    expect(await service.acquire('repo-1')).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith('repo:lock:repo-1', '1', 'EX', 1800, 'NX');
  });

  it('acquire returns false when lock already held', async () => {
    mockRedis.set.mockResolvedValue(null);
    expect(await service.acquire('repo-1')).toBe(false);
  });

  it('release deletes the lock key', async () => {
    mockRedis.del.mockResolvedValue(1);
    await service.release('repo-1');
    expect(mockRedis.del).toHaveBeenCalledWith('repo:lock:repo-1');
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd foreman
pnpm --filter @foreman/api test -- --testPathPattern="repo-lock.service" --watchAll=false
```
Expected: FAIL

- [ ] **Step 3: Create repo-lock.service.ts**

```typescript
// foreman/apps/api/src/workers/repo-lock.service.ts
import { Injectable, Inject, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

const LOCK_TTL_SECONDS = 1800;
const LOCK_PREFIX = 'repo:lock:';

@Injectable()
export class RepoLockService {
  private readonly logger = new Logger(RepoLockService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async acquire(repoId: string): Promise<boolean> {
    const key = `${LOCK_PREFIX}${repoId}`;
    const result = await this.redis.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
    if (result === 'OK') {
      this.logger.log(`Lock acquired for repo ${repoId}`);
      return true;
    }
    this.logger.warn(`Lock already held for repo ${repoId} — requeueing`);
    return false;
  }

  async release(repoId: string): Promise<void> {
    await this.redis.del(`${LOCK_PREFIX}${repoId}`);
    this.logger.log(`Lock released for repo ${repoId}`);
  }
}
```

- [ ] **Step 4: Add Redis client provider to workers.module.ts**

```typescript
// foreman/apps/api/src/workers/workers.module.ts  (full replacement)
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import Redis from 'ioredis';
import { TaskProcessor } from './task.processor';
import { ClaudeRunnerService } from './claude-runner.service';
import { ToolExecutorService } from './tool-executor.service';
import { RepoLockService } from './repo-lock.service';
import { SuccessObserverService } from './success-observer.service';
import { ReposModule } from '../repos/repos.module';
import { SettingsModule } from '../settings/settings.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'foreman-tasks' }),
    ReposModule,
    SettingsModule,
    AgentsModule,
  ],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379'),
    },
    TaskProcessor,
    ClaudeRunnerService,
    ToolExecutorService,
    RepoLockService,
    SuccessObserverService,
  ],
})
export class WorkersModule {}
```

- [ ] **Step 5: Run tests to confirm pass**

```bash
cd foreman
pnpm --filter @foreman/api test -- --testPathPattern="repo-lock.service" --watchAll=false
```
Expected: PASS — 3 tests pass

- [ ] **Step 6: Commit**

```bash
cd foreman
git add apps/api/src/workers/repo-lock.service.ts apps/api/src/workers/repo-lock.service.spec.ts apps/api/src/workers/workers.module.ts
git commit -m "feat(workers): add RepoLockService with Redis SETNX per-repo locking"
```

---

### Task 3: ToolExecutorService — All 6 Tools

**Files:**
- Create: `foreman/apps/api/src/workers/tool-executor.service.ts`
- Test: `foreman/apps/api/src/workers/tool-executor.service.spec.ts`

**Interfaces:**
- Produces: `ToolExecutorService.execute(toolName: ToolName, input: Record<string, unknown>, repoPath: string): Promise<string>`
  - `read_file`: reads `${repoPath}/${path}`, validates path stays within repoPath, returns file content
  - `write_file`: writes content to `${repoPath}/${path}`, creates dirs as needed
  - `list_directory`: returns `JSON.stringify` of directory entries with type (file/dir)
  - `execute_command`: runs whitelisted commands (`git`, `npm`, `pnpm`, `tsc`, `node`, `npx`) in `repoPath`, returns stdout+stderr
  - `create_pull_request`: calls GitHub API `POST /repos/{owner}/{repo}/pulls` with `github_token` from SettingsService
  - `foreman_complete`: returns `'DONE'` sentinel string

- [ ] **Step 1: Write failing tests**

```typescript
// foreman/apps/api/src/workers/tool-executor.service.spec.ts
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { ToolExecutorService } from './tool-executor.service';
import { SettingsService } from '../settings/settings.service';

const mockSettings = { getRaw: jest.fn() };

describe('ToolExecutorService', () => {
  let service: ToolExecutorService;
  let tmpDir: string;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ToolExecutorService,
        { provide: SettingsService, useValue: mockSettings },
      ],
    }).compile();
    service = module.get(ToolExecutorService);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foreman-test-'));
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('read_file reads a file within repoPath', async () => {
    await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'hello world');
    const result = await service.execute('read_file', { path: 'hello.txt' }, tmpDir);
    expect(result).toBe('hello world');
  });

  it('read_file rejects path traversal', async () => {
    await expect(service.execute('read_file', { path: '../../etc/passwd' }, tmpDir)).rejects.toThrow(BadRequestException);
  });

  it('write_file creates a file', async () => {
    await service.execute('write_file', { path: 'new.ts', content: 'export const x = 1;' }, tmpDir);
    const content = await fs.readFile(path.join(tmpDir, 'new.ts'), 'utf-8');
    expect(content).toBe('export const x = 1;');
  });

  it('list_directory returns entries', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.ts'), '');
    const result = await service.execute('list_directory', { path: '.' }, tmpDir);
    const entries = JSON.parse(result) as { name: string; type: string }[];
    expect(entries.some((e) => e.name === 'a.ts')).toBe(true);
  });

  it('execute_command rejects non-whitelisted commands', async () => {
    await expect(service.execute('execute_command', { command: 'rm -rf /' }, tmpDir)).rejects.toThrow(BadRequestException);
  });

  it('foreman_complete returns DONE', async () => {
    const result = await service.execute('foreman_complete', {}, tmpDir);
    expect(result).toBe('DONE');
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd foreman
pnpm --filter @foreman/api test -- --testPathPattern="tool-executor.service" --watchAll=false
```
Expected: FAIL

- [ ] **Step 3: Create tool-executor.service.ts**

```typescript
// foreman/apps/api/src/workers/tool-executor.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import * as path from 'path';
import type { ToolName } from '@foreman/types';
import { SettingsService } from '../settings/settings.service';

const ALLOWED_COMMANDS = /^(git|npm|pnpm|tsc|node|npx)\s/;
const EXEC_TIMEOUT_MS = 120_000;

@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name);

  constructor(private readonly settings: SettingsService) {}

  async execute(
    toolName: ToolName,
    input: Record<string, unknown>,
    repoPath: string,
  ): Promise<string> {
    switch (toolName) {
      case 'read_file': return this.readFile(String(input.path), repoPath);
      case 'write_file': return this.writeFile(String(input.path), String(input.content), repoPath);
      case 'list_directory': return this.listDirectory(String(input.path ?? '.'), repoPath);
      case 'execute_command': return this.executeCommand(String(input.command), repoPath);
      case 'create_pull_request': return this.createPullRequest(input, repoPath);
      case 'foreman_complete': return 'DONE';
    }
  }

  private resolveSafe(filePath: string, repoPath: string): string {
    const resolved = path.resolve(repoPath, filePath);
    if (!resolved.startsWith(path.resolve(repoPath))) {
      throw new BadRequestException(`Path traversal detected: ${filePath}`);
    }
    return resolved;
  }

  private async readFile(filePath: string, repoPath: string): Promise<string> {
    const full = this.resolveSafe(filePath, repoPath);
    return readFile(full, 'utf-8');
  }

  private async writeFile(filePath: string, content: string, repoPath: string): Promise<string> {
    const full = this.resolveSafe(filePath, repoPath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, 'utf-8');
    return `Written ${filePath}`;
  }

  private async listDirectory(dirPath: string, repoPath: string): Promise<string> {
    const full = this.resolveSafe(dirPath, repoPath);
    const entries = await readdir(full);
    const result = await Promise.all(
      entries.map(async (name) => {
        const s = await stat(path.join(full, name));
        return { name, type: s.isDirectory() ? 'dir' : 'file' };
      }),
    );
    return JSON.stringify(result, null, 2);
  }

  private executeCommand(command: string, repoPath: string): string {
    if (!ALLOWED_COMMANDS.test(command)) {
      throw new BadRequestException(`Command not allowed: ${command}. Must start with: git, npm, pnpm, tsc, node, npx`);
    }
    try {
      const output = execSync(command, {
        cwd: repoPath,
        timeout: EXEC_TIMEOUT_MS,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      return output;
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      return `COMMAND FAILED:\nstdout: ${e.stdout ?? ''}\nstderr: ${e.stderr ?? ''}\n${e.message ?? ''}`;
    }
  }

  private async createPullRequest(
    input: Record<string, unknown>,
    repoPath: string,
  ): Promise<string> {
    const token = await this.settings.getRaw('github_token');
    if (!token) return 'ERROR: github_token not configured in settings';

    const githubRepo = String(input.repo ?? '');
    const title = String(input.title ?? 'Foreman: automated change');
    const body = String(input.body ?? '');
    const head = String(input.head ?? 'foreman/auto');
    const base = String(input.base ?? 'main');

    const response = await fetch(`https://api.github.com/repos/${githubRepo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body, head, base }),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`GitHub PR creation failed: ${response.status} ${text}`);
      return `ERROR creating PR: ${response.status} ${text}`;
    }

    const pr = (await response.json()) as { html_url: string; number: number };
    this.logger.log(`PR created: ${pr.html_url}`);
    return JSON.stringify({ url: pr.html_url, number: pr.number });
  }
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd foreman
pnpm --filter @foreman/api test -- --testPathPattern="tool-executor.service" --watchAll=false
```
Expected: PASS — 6 tests pass

- [ ] **Step 5: Commit**

```bash
cd foreman
git add apps/api/src/workers/tool-executor.service.ts apps/api/src/workers/tool-executor.service.spec.ts
git commit -m "feat(workers): add ToolExecutorService with all 6 Claude tools"
```

---

### Task 4: ClaudeRunnerService — Agentic SDK Loop

**Files:**
- Create: `foreman/apps/api/src/workers/claude-runner.service.ts`

**Interfaces:**
- Consumes: `AgentsRegistry.getConfig(type)`, `ToolExecutorService.execute()`
- Produces: `ClaudeRunnerService.run(context: RoundContext, agentType: AgentType): Promise<AgentRunResult>`
  - Runs Anthropic SDK messages loop with tool_use
  - Stops when Claude calls `foreman_complete` OR `maxIterations` reached
  - Returns `{ success, mrUrl, error, log }`

- [ ] **Step 1: Create claude-runner.service.ts**

```typescript
// foreman/apps/api/src/workers/claude-runner.service.ts
import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import type { AgentType, AgentRunResult, RoundContext, ToolName } from '@foreman/types';
import { AgentsRegistry } from '../agents/agents.registry';
import { ToolExecutorService } from './tool-executor.service';

const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'read_file',
    description: 'Read a file from the repository. Path is relative to the repo root.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Relative file path' } },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file in the repository. Creates parent directories if needed.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and directories at a path relative to the repo root.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Directory path (default: ".")' } },
      required: [],
    },
  },
  {
    name: 'execute_command',
    description: 'Run a shell command (git, npm, pnpm, tsc, node, npx only) in the repo root.',
    input_schema: {
      type: 'object',
      properties: { command: { type: 'string', description: 'The command to execute' } },
      required: ['command'],
    },
  },
  {
    name: 'create_pull_request',
    description: 'Create a GitHub pull request for the changes made.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'GitHub repo in org/repo format' },
        title: { type: 'string' },
        body: { type: 'string' },
        head: { type: 'string', description: 'Source branch name' },
        base: { type: 'string', description: 'Target branch (default: main)' },
      },
      required: ['repo', 'title', 'body', 'head'],
    },
  },
  {
    name: 'foreman_complete',
    description: 'Signal that the task is complete. Call this when all work is done.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

@Injectable()
export class ClaudeRunnerService {
  private readonly logger = new Logger(ClaudeRunnerService.name);
  private readonly client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  constructor(
    private readonly registry: AgentsRegistry,
    private readonly tools: ToolExecutorService,
  ) {}

  async run(context: RoundContext, agentType: AgentType): Promise<AgentRunResult> {
    const config = this.registry.getConfig(agentType);
    const logLines: string[] = [];
    let mrUrl: string | null = null;
    let completed = false;

    const allowed = new Set(config.allowedTools);
    const filteredTools = TOOL_DEFINITIONS.filter((t) => allowed.has(t.name as ToolName));

    const userPrompt = this.buildUserPrompt(context);
    const messages: MessageParam[] = [{ role: 'user', content: userPrompt }];

    const log = (line: string) => {
      logLines.push(line);
      this.logger.log(`[Task ${context.taskId}] ${line}`);
    };

    log(`=== Round ${context.round} start — ${agentType} agent ===`);

    try {
      for (let iteration = 0; iteration < config.maxIterations; iteration++) {
        const response = await this.client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          system: config.systemPrompt,
          tools: filteredTools,
          messages,
        });

        messages.push({ role: 'assistant', content: response.content });

        if (response.stop_reason === 'end_turn') {
          log('Agent reached end_turn without calling foreman_complete');
          break;
        }

        const toolUses = response.content.filter((b) => b.type === 'tool_use');
        if (toolUses.length === 0) break;

        const toolResults: MessageParam['content'] = [];

        for (const block of toolUses) {
          if (block.type !== 'tool_use') continue;
          const toolName = block.name as ToolName;
          const input = block.input as Record<string, unknown>;

          log(`Tool: ${toolName}(${JSON.stringify(input).slice(0, 120)})`);

          let toolOutput: string;
          try {
            toolOutput = await this.tools.execute(toolName, input, context.repoPath);
          } catch (err) {
            toolOutput = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
          }

          if (toolName === 'foreman_complete') {
            completed = true;
            log('foreman_complete called — task complete');
          }

          if (toolName === 'create_pull_request' && toolOutput.includes('"url"')) {
            try {
              const parsed = JSON.parse(toolOutput) as { url: string };
              mrUrl = parsed.url;
              log(`PR created: ${mrUrl}`);
            } catch { /* non-JSON response, continue */ }
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: toolOutput,
          });
        }

        messages.push({ role: 'user', content: toolResults });

        if (completed) break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`SDK error: ${message}`);
      return { success: false, mrUrl: null, error: message, log: logLines.join('\n') };
    }

    return {
      success: completed,
      mrUrl,
      error: completed ? null : 'Agent did not call foreman_complete',
      log: logLines.join('\n'),
    };
  }

  private buildUserPrompt(context: RoundContext): string {
    const lines = [
      `Issue: ${context.issueKey}`,
      `Title: ${context.title}`,
      `Repository path: ${context.repoPath}`,
      `Round: ${context.round}`,
    ];
    if (context.previousError) {
      lines.push(`\nPrevious round failed with: ${context.previousError}`);
      lines.push('Please analyze the error and try a different approach.');
    }
    return lines.join('\n');
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd foreman
git add apps/api/src/workers/claude-runner.service.ts
git commit -m "feat(workers): add ClaudeRunnerService with Anthropic SDK agentic loop"
```

---

### Task 5: SuccessObserverService + TaskProcessor — Retry Loop

**Files:**
- Create: `foreman/apps/api/src/workers/success-observer.service.ts`
- Create: `foreman/apps/api/src/workers/task.processor.ts`
- Test: `foreman/apps/api/src/workers/task.processor.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `ClaudeRunnerService`, `RepoLockService`, `SuccessObserverService`, `ReposService`, `SettingsService`
- Produces:
  - `SuccessObserverService.check(conditions, runResult): Promise<boolean>`
  - `TaskProcessor` — `@Processor('foreman-tasks')`, `@Process('process-task')` handler
    - acquires lock → runs rounds → on all rounds fail: task `failed` → releases lock

- [ ] **Step 1: Write failing processor test**

```typescript
// foreman/apps/api/src/workers/task.processor.spec.ts
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { TaskProcessor } from './task.processor';
import { ClaudeRunnerService } from './claude-runner.service';
import { RepoLockService } from './repo-lock.service';
import { SuccessObserverService } from './success-observer.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReposService } from '../repos/repos.service';

const taskId = 'task-abc';
const repoId = 'repo-1';
const fakeTask = { id: taskId, issueKey: 'MAH-1', title: 'Fix X', repoId, agentType: 'bugfix', status: 'queued', round: 0, maxRounds: 2, log: '', mrUrl: null, error: null };
const fakeRepo = { id: repoId, path: '/repos/my-app', githubRepo: 'org/my-app', name: 'my-app', active: true };

const mockPrisma = {
  task: {
    findUnique: jest.fn().mockResolvedValue(fakeTask),
    update: jest.fn().mockImplementation(async ({ data }) => ({ ...fakeTask, ...data })),
  },
};
const mockRunner = { run: jest.fn() };
const mockLock = { acquire: jest.fn().mockResolvedValue(true), release: jest.fn() };
const mockObserver = { check: jest.fn().mockResolvedValue(true) };
const mockRepos = { findOne: jest.fn().mockResolvedValue(fakeRepo) };
const mockQueue = { add: jest.fn() };

describe('TaskProcessor', () => {
  let processor: TaskProcessor;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TaskProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClaudeRunnerService, useValue: mockRunner },
        { provide: RepoLockService, useValue: mockLock },
        { provide: SuccessObserverService, useValue: mockObserver },
        { provide: ReposService, useValue: mockRepos },
        { provide: getQueueToken('foreman-tasks'), useValue: mockQueue },
      ],
    }).compile();
    processor = module.get(TaskProcessor);
    jest.clearAllMocks();
    mockPrisma.task.findUnique.mockResolvedValue(fakeTask);
    mockLock.acquire.mockResolvedValue(true);
    mockObserver.check.mockResolvedValue(true);
    mockRunner.run.mockResolvedValue({ success: true, mrUrl: 'https://github.com/pr/1', error: null, log: 'done' });
  });

  it('marks task done when agent succeeds and conditions pass', async () => {
    await processor.handleTask({ data: { taskId } } as never);
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'done' }) }),
    );
  });

  it('requeues with delay if lock not acquired', async () => {
    mockLock.acquire.mockResolvedValueOnce(false);
    await processor.handleTask({ data: { taskId } } as never);
    expect(mockQueue.add).toHaveBeenCalledWith('process-task', { taskId }, expect.objectContaining({ delay: expect.any(Number) }));
    expect(mockRunner.run).not.toHaveBeenCalled();
  });

  it('marks task failed after maxRounds exhausted', async () => {
    mockRunner.run.mockResolvedValue({ success: false, mrUrl: null, error: 'boom', log: 'fail' });
    mockObserver.check.mockResolvedValue(false);
    mockPrisma.task.findUnique
      .mockResolvedValueOnce({ ...fakeTask, round: 1 })
      .mockResolvedValueOnce({ ...fakeTask, round: 2, maxRounds: 2 });
    await processor.handleTask({ data: { taskId } } as never);
    const lastCall = mockPrisma.task.update.mock.calls.at(-1);
    expect(lastCall?.[0]?.data?.status).toBe('failed');
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd foreman
pnpm --filter @foreman/api test -- --testPathPattern="task.processor" --watchAll=false
```
Expected: FAIL

- [ ] **Step 3: Create success-observer.service.ts**

```typescript
// foreman/apps/api/src/workers/success-observer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import type { SuccessCondition, AgentRunResult } from '@foreman/types';

@Injectable()
export class SuccessObserverService {
  private readonly logger = new Logger(SuccessObserverService.name);

  async check(conditions: SuccessCondition[], result: AgentRunResult): Promise<boolean> {
    for (const condition of conditions) {
      const passed = this.evaluate(condition, result);
      this.logger.log(`Condition ${condition}: ${passed ? 'PASS' : 'FAIL'}`);
      if (!passed) return false;
    }
    return true;
  }

  private evaluate(condition: SuccessCondition, result: AgentRunResult): boolean {
    switch (condition) {
      case 'mr_created': return result.mrUrl !== null;
      case 'no_build_errors': return result.success && !result.error;
      case 'ci_passed': return result.success && result.mrUrl !== null;
    }
  }
}
```

- [ ] **Step 4: Create task.processor.ts**

```typescript
// foreman/apps/api/src/workers/task.processor.ts
import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bull';
import type { AgentType } from '@foreman/types';
import { PrismaService } from '../prisma/prisma.service';
import { ReposService } from '../repos/repos.service';
import { ClaudeRunnerService } from './claude-runner.service';
import { RepoLockService } from './repo-lock.service';
import { SuccessObserverService } from './success-observer.service';
import { AgentsRegistry } from '../agents/agents.registry';

const REQUEUE_DELAY_MS = 60_000;

@Processor('foreman-tasks')
export class TaskProcessor {
  private readonly logger = new Logger(TaskProcessor.name);

  constructor(
    @InjectQueue('foreman-tasks') private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly repos: ReposService,
    private readonly runner: ClaudeRunnerService,
    private readonly lock: RepoLockService,
    private readonly observer: SuccessObserverService,
    private readonly registry: AgentsRegistry,
  ) {}

  @Process('process-task')
  async handleTask(job: Job<{ taskId: string }>): Promise<void> {
    const { taskId } = job.data;
    this.logger.log(`Processing task ${taskId}`);

    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) { this.logger.error(`Task ${taskId} not found`); return; }

    const acquired = await this.lock.acquire(task.repoId);
    if (!acquired) {
      this.logger.warn(`Repo ${task.repoId} locked — requeueing task ${taskId}`);
      await this.queue.add('process-task', { taskId }, { delay: REQUEUE_DELAY_MS });
      return;
    }

    try {
      const repo = await this.repos.findOne(task.repoId);
      const nextRound = task.round + 1;

      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: 'running', round: nextRound },
      });

      const config = this.registry.getConfig(task.agentType as AgentType);
      const result = await this.runner.run(
        {
          taskId,
          repoPath: repo.path,
          issueKey: task.issueKey,
          title: task.title,
          round: nextRound,
          previousError: task.error,
        },
        task.agentType as AgentType,
      );

      const succeeded = await this.observer.check(config.successConditions, result);

      const appendedLog = task.log
        ? `${task.log}\n--- Round ${nextRound} ---\n${result.log}`
        : `--- Round ${nextRound} ---\n${result.log}`;

      if (succeeded) {
        await this.prisma.task.update({
          where: { id: taskId },
          data: { status: 'done', mrUrl: result.mrUrl, error: null, log: appendedLog },
        });
        this.logger.log(`Task ${taskId} completed successfully`);
      } else if (nextRound >= task.maxRounds) {
        await this.prisma.task.update({
          where: { id: taskId },
          data: { status: 'failed', error: result.error, log: appendedLog },
        });
        this.logger.warn(`Task ${taskId} failed after ${nextRound} rounds`);
      } else {
        await this.prisma.task.update({
          where: { id: taskId },
          data: { status: 'queued', error: result.error, log: appendedLog },
        });
        await this.queue.add('process-task', { taskId }, { attempts: 1 });
        this.logger.log(`Task ${taskId} round ${nextRound} failed — scheduling round ${nextRound + 1}`);
      }
    } finally {
      await this.lock.release(task.repoId);
    }
  }
}
```

- [ ] **Step 5: Add AgentsRegistry to WorkersModule providers**

Add `AgentsRegistry` to the providers array in `workers.module.ts` — import it from `../agents/agents.registry`.

```typescript
// Modify the providers array in workers.module.ts to add:
import { AgentsRegistry } from '../agents/agents.registry';
// ...
providers: [
  { provide: 'REDIS_CLIENT', useFactory: () => new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379') },
  TaskProcessor,
  ClaudeRunnerService,
  ToolExecutorService,
  RepoLockService,
  SuccessObserverService,
  AgentsRegistry,  // ← add this
],
```

- [ ] **Step 6: Run all worker tests**

```bash
cd foreman
pnpm --filter @foreman/api test -- --testPathPattern="workers" --watchAll=false
```
Expected: all pass

- [ ] **Step 7: Run all API tests**

```bash
cd foreman
pnpm --filter @foreman/api test -- --watchAll=false
```
Expected: all pass, no failures

- [ ] **Step 8: Commit**

```bash
cd foreman
git add apps/api/src/workers/
git commit -m "feat(workers): add TaskProcessor, SuccessObserver, and Claude agentic retry loop"
```

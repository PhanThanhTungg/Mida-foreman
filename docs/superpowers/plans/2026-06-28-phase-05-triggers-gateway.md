# Phase 5: Triggers & WebSocket Gateway — Foreman

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the WebSocket gateway for real-time log streaming and the Jira poller that auto-enqueues tickets from configured Jira projects.

**Architecture:** `GatewayModule` exposes a Socket.IO gateway on the `/ws` namespace. The gateway emits two message shapes: `{ type: 'log', taskId, line }` and `{ type: 'status', taskId, status, round }`. `TaskProcessor` (Phase 4) injects `ForemanGateway` and calls `emitLog` / `emitStatus` on each update. `TriggersModule` runs a `@Cron`-style polling loop via `setInterval`; it reads `poll_interval_ms` from DB each cycle, queries Jira via REST, and enqueues matching tickets through `OrchestratorService`.

**Tech Stack:** `@nestjs/websockets`, `socket.io`, `@nestjs/platform-socket.io`, `@nestjs/schedule`, NestJS 10+

**Prerequisite:** Phase 3 (SettingsModule with `getRaw`) and Phase 4 (OrchestratorService) complete.

---

## File Structure

```
foreman/apps/api/src/
├── gateway/
│   ├── gateway.module.ts
│   ├── foreman.gateway.ts          # @WebSocketGateway('/ws')
│   └── foreman.gateway.spec.ts
└── triggers/
    ├── triggers.module.ts
    └── jira-poller.service.ts      # OnApplicationBootstrap, setInterval loop
```

Also modify:
- `foreman/apps/api/src/app.module.ts` — import `GatewayModule`, `TriggersModule`
- `foreman/apps/api/src/workers/task.processor.ts` — inject `ForemanGateway` and emit events

---

### Task 1: GatewayModule — WebSocket Real-Time Events

**Files:**
- Create: `foreman/apps/api/src/gateway/foreman.gateway.ts`
- Create: `foreman/apps/api/src/gateway/gateway.module.ts`
- Test: `foreman/apps/api/src/gateway/foreman.gateway.spec.ts`

**Interfaces:**
- Produces:
  - `ForemanGateway.emitLog(taskId: string, line: string): void`
  - `ForemanGateway.emitStatus(taskId: string, status: string, round: number): void`
  - Clients subscribe by connecting to Socket.IO namespace `/ws` — all connected clients receive all events (filter by `taskId` on the client side)

- [ ] **Step 1: Write the failing gateway test**

```typescript
// foreman/apps/api/src/gateway/foreman.gateway.spec.ts
import { Test } from '@nestjs/testing';
import { ForemanGateway } from './foreman.gateway';

const mockServer = { emit: jest.fn() };

describe('ForemanGateway', () => {
  let gateway: ForemanGateway;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ForemanGateway],
    }).compile();
    gateway = module.get(ForemanGateway);
    (gateway as { server: typeof mockServer }).server = mockServer;
    jest.clearAllMocks();
  });

  it('emitLog sends log message to all clients', () => {
    gateway.emitLog('task-1', 'Tool: read_file({"path":"src/index.ts"})');
    expect(mockServer.emit).toHaveBeenCalledWith('message', {
      type: 'log',
      taskId: 'task-1',
      line: 'Tool: read_file({"path":"src/index.ts"})',
    });
  });

  it('emitStatus sends status message to all clients', () => {
    gateway.emitStatus('task-1', 'running', 2);
    expect(mockServer.emit).toHaveBeenCalledWith('message', {
      type: 'status',
      taskId: 'task-1',
      status: 'running',
      round: 2,
    });
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd foreman
pnpm --filter @foreman/api test -- --testPathPattern="foreman.gateway" --watchAll=false
```
Expected: FAIL — `Cannot find module './foreman.gateway'`

- [ ] **Step 3: Create foreman.gateway.ts**

```typescript
// foreman/apps/api/src/gateway/foreman.gateway.ts
import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { WsMessage } from '@foreman/types';

@WebSocketGateway({ namespace: '/ws', cors: { origin: '*' } })
export class ForemanGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ForemanGateway.name);

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitLog(taskId: string, line: string): void {
    const msg: WsMessage = { type: 'log', taskId, line };
    this.server.emit('message', msg);
  }

  emitStatus(taskId: string, status: string, round: number): void {
    const msg: WsMessage = { type: 'status', taskId, status: status as WsMessage['status'], round };
    this.server.emit('message', msg);
  }
}
```

- [ ] **Step 4: Create gateway.module.ts**

```typescript
// foreman/apps/api/src/gateway/gateway.module.ts
import { Module } from '@nestjs/common';
import { ForemanGateway } from './foreman.gateway';

@Module({ providers: [ForemanGateway], exports: [ForemanGateway] })
export class GatewayModule {}
```

- [ ] **Step 5: Run tests to confirm pass**

```bash
cd foreman
pnpm --filter @foreman/api test -- --testPathPattern="foreman.gateway" --watchAll=false
```
Expected: PASS — 2 tests pass

- [ ] **Step 6: Wire ForemanGateway into TaskProcessor**

In `foreman/apps/api/src/workers/task.processor.ts`, inject `ForemanGateway` and add emit calls at key points:

```typescript
// Add import at top of task.processor.ts:
import { ForemanGateway } from '../gateway/foreman.gateway';

// Add to constructor:
private readonly gateway: ForemanGateway,

// After updating task to 'running' (inside handleTask):
this.gateway.emitStatus(taskId, 'running', nextRound);

// Inside the runner's log callback — add a method to ClaudeRunnerService that accepts a log callback,
// OR emit after run() returns by sending the full log. The simpler approach: emit each log line
// by passing an onLog callback to ClaudeRunnerService.run():
```

Update `claude-runner.service.ts` to accept an optional `onLog` callback:

```typescript
// In ClaudeRunnerService.run signature (add optional 3rd param):
async run(
  context: RoundContext,
  agentType: AgentType,
  onLog?: (line: string) => void,
): Promise<AgentRunResult>

// Replace the internal log() function:
const log = (line: string) => {
  logLines.push(line);
  this.logger.log(`[Task ${context.taskId}] ${line}`);
  onLog?.(line);
};
```

In `task.processor.ts`, pass the gateway emit as the `onLog`:

```typescript
const result = await this.runner.run(
  { taskId, repoPath: repo.path, issueKey: task.issueKey, title: task.title, round: nextRound, previousError: task.error },
  task.agentType as AgentType,
  (line) => this.gateway.emitLog(taskId, line),
);
// After status update:
this.gateway.emitStatus(taskId, 'done', nextRound);   // or 'failed', 'queued'
```

Add `GatewayModule` to `WorkersModule` imports and `ForemanGateway` to providers list.

- [ ] **Step 7: Update app.module.ts to import GatewayModule**

```typescript
// Add to app.module.ts imports:
import { GatewayModule } from './gateway/gateway.module';
// In @Module imports array: add GatewayModule
```

- [ ] **Step 8: Run all tests**

```bash
cd foreman
pnpm --filter @foreman/api test -- --watchAll=false
```
Expected: all pass

- [ ] **Step 9: Commit**

```bash
cd foreman
git add apps/api/src/gateway/
git commit -m "feat(gateway): add ForemanGateway WebSocket for real-time log/status events"
```

---

### Task 2: TriggersModule — Jira Poller

**Files:**
- Create: `foreman/apps/api/src/triggers/jira-poller.service.ts`
- Create: `foreman/apps/api/src/triggers/triggers.module.ts`

**Interfaces:**
- Consumes:
  - `SettingsService.getRaw('jira_base_url')`, `getRaw('jira_email')`, `getRaw('jira_api_token')`, `getRaw('poll_interval_ms')`
  - `ReposService.findAll()` — to match `repo:<name>` labels
  - `OrchestratorService.enqueue(taskId)` — to queue discovered tickets
  - `PrismaService.task.findFirst` — to check for duplicate `issueKey` before enqueuing
- Produces:
  - `JiraPollerService` — implements `OnApplicationBootstrap`, `OnApplicationShutdown`
  - On boot: if `jira_api_token` is set, starts polling loop
  - Each cycle: fetches `JQL: project in (MAH, MIDA) AND status = "To Do" AND assignee = currentUser()`, detects agent type from labels `agent:feature`, `agent:bugfix`, `agent:support`, `agent:improve`, matches `repo:<name>` label to a `Repo`, skips if `issueKey` already in DB or in-memory set, enqueues new tasks

- [ ] **Step 1: Create jira-poller.service.ts**

```typescript
// foreman/apps/api/src/triggers/jira-poller.service.ts
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { AgentType } from '@foreman/types';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ReposService } from '../repos/repos.service';
import { OrchestratorService } from '../tasks/orchestrator.service';

const DEFAULT_POLL_INTERVAL_MS = 60_000;

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    labels: string[];
  };
}

@Injectable()
export class JiraPollerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JiraPollerService.name);
  private readonly processedKeys = new Set<string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly repos: ReposService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const token = await this.settings.getRaw('jira_api_token');
    if (!token) {
      this.logger.warn('jira_api_token not configured — Jira poller disabled');
      return;
    }
    this.logger.log('Jira poller starting');
    this.scheduleNextPoll();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNextPoll(): void {
    this.poll()
      .catch((err: unknown) => this.logger.error('Poll cycle error', err instanceof Error ? err.stack : String(err)))
      .finally(async () => {
        const intervalStr = await this.settings.getRaw('poll_interval_ms');
        const interval = intervalStr ? parseInt(intervalStr, 10) : DEFAULT_POLL_INTERVAL_MS;
        this.timer = setTimeout(() => this.scheduleNextPoll(), interval);
      });
  }

  async poll(): Promise<void> {
    const [baseUrl, email, token] = await Promise.all([
      this.settings.getRaw('jira_base_url'),
      this.settings.getRaw('jira_email'),
      this.settings.getRaw('jira_api_token'),
    ]);

    if (!baseUrl || !email || !token) {
      this.logger.warn('Jira credentials incomplete — skipping poll cycle');
      return;
    }

    const jql = 'project in (MAH, MIDA) AND status = "To Do" AND assignee = currentUser()';
    const url = `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,labels&maxResults=50`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      this.logger.error(`Jira API returned ${response.status}: ${await response.text()}`);
      return;
    }

    const data = (await response.json()) as { issues: JiraIssue[] };
    const allRepos = await this.repos.findAll();

    for (const issue of data.issues) {
      await this.processIssue(issue, allRepos);
    }
  }

  private async processIssue(
    issue: JiraIssue,
    allRepos: Awaited<ReturnType<ReposService['findAll']>>,
  ): Promise<void> {
    if (this.processedKeys.has(issue.key)) return;

    const existing = await this.prisma.task.findFirst({ where: { issueKey: issue.key } });
    if (existing) {
      this.processedKeys.add(issue.key);
      return;
    }

    const labels = issue.fields.labels;

    const agentLabel = labels.find((l) => l.startsWith('agent:'));
    const agentType = agentLabel?.replace('agent:', '') as AgentType | undefined;
    if (!agentType || !['feature', 'bugfix', 'support', 'improve'].includes(agentType)) {
      this.logger.warn(`Issue ${issue.key} has no valid agent: label — skipping`);
      return;
    }

    const repoLabel = labels.find((l) => l.startsWith('repo:'));
    const repoName = repoLabel?.replace('repo:', '');
    const repo = allRepos.find((r) => r.name === repoName);
    if (!repo) {
      this.logger.warn(`Issue ${issue.key}: repo "${repoName}" not found — skipping`);
      return;
    }

    const task = await this.prisma.task.create({
      data: {
        issueKey: issue.key,
        title: issue.fields.summary,
        repoId: repo.id,
        agentType,
        status: 'queued',
        maxRounds: 5,
      },
    });

    await this.orchestrator.enqueue(task.id);
    this.processedKeys.add(issue.key);
    this.logger.log(`Enqueued ${issue.key} as ${agentType} task for repo ${repoName}`);
  }
}
```

- [ ] **Step 2: Create triggers.module.ts**

```typescript
// foreman/apps/api/src/triggers/triggers.module.ts
import { Module } from '@nestjs/common';
import { JiraPollerService } from './jira-poller.service';
import { SettingsModule } from '../settings/settings.module';
import { ReposModule } from '../repos/repos.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [SettingsModule, ReposModule, TasksModule],
  providers: [JiraPollerService],
})
export class TriggersModule {}
```

- [ ] **Step 3: Update app.module.ts to import TriggersModule**

```typescript
// Add to app.module.ts:
import { TriggersModule } from './triggers/triggers.module';
// Add TriggersModule to the imports array
```

- [ ] **Step 4: Run all tests**

```bash
cd foreman
pnpm --filter @foreman/api test -- --watchAll=false
```
Expected: all pass

- [ ] **Step 5: Smoke test — verify poller logs "disabled" when no token set**

```bash
cd foreman/apps/api
API_KEY=test DATABASE_URL="postgresql://foreman:foreman@localhost:5432/foreman" \
  REDIS_URL="redis://localhost:6379" NODE_ENV=development pnpm dev 2>&1 | grep -i "jira"
```
Expected: `jira_api_token not configured — Jira poller disabled`

Kill: `pkill -f "nest start"`

- [ ] **Step 6: Commit**

```bash
cd foreman
git add apps/api/src/triggers/ apps/api/src/app.module.ts
git commit -m "feat(triggers): add JiraPollerService with dynamic interval from DB"
```

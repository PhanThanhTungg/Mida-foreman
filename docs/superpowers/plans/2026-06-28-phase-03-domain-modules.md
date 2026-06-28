# Phase 3: Domain Modules — Foreman

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement ReposModule, SettingsModule, TasksModule, and AgentsModule with full CRUD, DTOs, and Swagger decorators.

**Architecture:** Four NestJS feature modules, each self-contained (controller + service + DTOs). `OrchestratorService` lives in `TasksModule` and enqueues BullMQ jobs (queue wired in Phase 4 — use a stub here). `SettingsService` masks values where keys end in `_token` or `_api_token` on GET. Each module is registered in `AppModule`.

**Tech Stack:** NestJS 10+, Prisma, class-validator, class-transformer, @nestjs/swagger

**Prerequisite:** Phase 2 complete (PrismaModule global, ApiKeyGuard wired, DB migrated).

---

## File Structure

```
foreman/apps/api/src/
├── repos/
│   ├── repos.module.ts
│   ├── repos.service.ts
│   ├── repos.controller.ts
│   ├── repos.service.spec.ts
│   └── dto/
│       ├── create-repo.dto.ts
│       └── update-repo.dto.ts
├── settings/
│   ├── settings.module.ts
│   ├── settings.service.ts
│   ├── settings.controller.ts
│   ├── settings.service.spec.ts
│   └── dto/
│       └── upsert-settings.dto.ts
├── tasks/
│   ├── tasks.module.ts
│   ├── tasks.service.ts
│   ├── tasks.controller.ts
│   ├── orchestrator.service.ts
│   ├── tasks.service.spec.ts
│   └── dto/
│       └── create-task.dto.ts
└── agents/
    ├── agents.module.ts
    ├── agents.registry.ts
    └── agents.controller.ts
```

Also modify: `foreman/apps/api/src/app.module.ts` — import new modules.

---

### Task 1: ReposModule — CRUD + Verify

**Files:**
- Create: `foreman/apps/api/src/repos/dto/create-repo.dto.ts`
- Create: `foreman/apps/api/src/repos/dto/update-repo.dto.ts`
- Create: `foreman/apps/api/src/repos/repos.service.ts`
- Create: `foreman/apps/api/src/repos/repos.controller.ts`
- Create: `foreman/apps/api/src/repos/repos.module.ts`
- Test: `foreman/apps/api/src/repos/repos.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (global)
- Produces:
  - `ReposService.findAll(): Promise<Repo[]>`
  - `ReposService.findOne(id: string): Promise<Repo>` — throws `NotFoundException('Repo ${id} not found')` if missing
  - `ReposService.create(dto: CreateRepoDto): Promise<Repo>`
  - `ReposService.update(id: string, dto: UpdateRepoDto): Promise<Repo>`
  - `ReposService.remove(id: string): Promise<void>`
  - `ReposService.verify(id: string): Promise<RepoVerifyResult>`
  - Routes: `GET /api/repos`, `POST /api/repos`, `PUT /api/repos/:id`, `DELETE /api/repos/:id`, `POST /api/repos/:id/verify`

- [ ] **Step 1: Write failing service test**

```typescript
// foreman/apps/api/src/repos/repos.service.spec.ts
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ReposService } from './repos.service';
import { PrismaService } from '../prisma/prisma.service';

const fakeRepo = {
  id: 'repo-1',
  name: 'my-app',
  path: '/repos/my-app',
  githubRepo: 'org/my-app',
  description: '',
  active: true,
  createdAt: new Date(),
};

const mockPrisma = {
  repo: {
    findMany: jest.fn().mockResolvedValue([fakeRepo]),
    findUnique: jest.fn().mockResolvedValue(fakeRepo),
    create: jest.fn().mockResolvedValue(fakeRepo),
    update: jest.fn().mockResolvedValue(fakeRepo),
    delete: jest.fn().mockResolvedValue(fakeRepo),
  },
};

describe('ReposService', () => {
  let service: ReposService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ReposService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(ReposService);
    jest.clearAllMocks();
    mockPrisma.repo.findUnique.mockResolvedValue(fakeRepo);
  });

  it('findAll returns array', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeRepo]);
  });

  it('findOne returns repo', async () => {
    const result = await service.findOne('repo-1');
    expect(result.id).toBe('repo-1');
  });

  it('findOne throws NotFoundException for missing repo', async () => {
    mockPrisma.repo.findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('create delegates to prisma', async () => {
    await service.create({ name: 'my-app', path: '/repos/my-app', githubRepo: 'org/my-app' });
    expect(mockPrisma.repo.create).toHaveBeenCalledWith({
      data: { name: 'my-app', path: '/repos/my-app', githubRepo: 'org/my-app', description: '' },
    });
  });

  it('remove deletes repo', async () => {
    await service.remove('repo-1');
    expect(mockPrisma.repo.delete).toHaveBeenCalledWith({ where: { id: 'repo-1' } });
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd foreman
pnpm --filter @foreman/api test -- --testPathPattern="repos.service" --watchAll=false
```
Expected: FAIL — `Cannot find module './repos.service'`

- [ ] **Step 3: Create create-repo.dto.ts**

```typescript
// foreman/apps/api/src/repos/dto/create-repo.dto.ts
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRepoDto {
  @ApiProperty({ example: 'my-app' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '/home/user/repos/my-app' })
  @IsString()
  @IsNotEmpty()
  path!: string;

  @ApiProperty({ example: 'org/my-app' })
  @IsString()
  @IsNotEmpty()
  githubRepo!: string;

  @ApiPropertyOptional({ example: 'Main customer-facing app' })
  @IsOptional()
  @IsString()
  description?: string;
}
```

- [ ] **Step 4: Create update-repo.dto.ts**

```typescript
// foreman/apps/api/src/repos/dto/update-repo.dto.ts
import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRepoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() path?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() githubRepo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
```

- [ ] **Step 5: Create repos.service.ts**

```typescript
// foreman/apps/api/src/repos/repos.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import type { Repo } from '@prisma/client';
import type { RepoVerifyResult } from '@foreman/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRepoDto } from './dto/create-repo.dto';
import { UpdateRepoDto } from './dto/update-repo.dto';

@Injectable()
export class ReposService {
  private readonly logger = new Logger(ReposService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Repo[]> {
    return this.prisma.repo.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<Repo> {
    const repo = await this.prisma.repo.findUnique({ where: { id } });
    if (!repo) throw new NotFoundException(`Repo ${id} not found`);
    return repo;
  }

  create(dto: CreateRepoDto): Promise<Repo> {
    return this.prisma.repo.create({
      data: {
        name: dto.name,
        path: dto.path,
        githubRepo: dto.githubRepo,
        description: dto.description ?? '',
      },
    });
  }

  async update(id: string, dto: UpdateRepoDto): Promise<Repo> {
    await this.findOne(id);
    return this.prisma.repo.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.repo.delete({ where: { id } });
  }

  async verify(id: string): Promise<RepoVerifyResult> {
    const repo = await this.findOne(id);
    const pathExists = existsSync(repo.path);
    let isGitRepo = false;
    let canGitStatus = false;

    if (pathExists) {
      isGitRepo = existsSync(`${repo.path}/.git`);
      try {
        execSync('git status', { cwd: repo.path, stdio: 'pipe' });
        canGitStatus = true;
      } catch {
        this.logger.warn(`git status failed for repo ${id} at ${repo.path}`);
      }
    }

    return { pathExists, isGitRepo, canGitStatus };
  }
}
```

- [ ] **Step 6: Create repos.controller.ts**

```typescript
// foreman/apps/api/src/repos/repos.controller.ts
import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation } from '@nestjs/swagger';
import { ReposService } from './repos.service';
import { CreateRepoDto } from './dto/create-repo.dto';
import { UpdateRepoDto } from './dto/update-repo.dto';

@ApiTags('repos')
@ApiSecurity('api-key')
@Controller('repos')
export class ReposController {
  constructor(private readonly repos: ReposService) {}

  @Get()
  @ApiOperation({ summary: 'List all repos' })
  findAll() { return this.repos.findAll(); }

  @Post()
  @ApiOperation({ summary: 'Register a new repo' })
  create(@Body() dto: CreateRepoDto) { return this.repos.create(dto); }

  @Put(':id')
  @ApiOperation({ summary: 'Update a repo' })
  update(@Param('id') id: string, @Body() dto: UpdateRepoDto) { return this.repos.update(id, dto); }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a repo' })
  async remove(@Param('id') id: string) { await this.repos.remove(id); }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Verify repo path + git status' })
  verify(@Param('id') id: string) { return this.repos.verify(id); }
}
```

- [ ] **Step 7: Create repos.module.ts**

```typescript
// foreman/apps/api/src/repos/repos.module.ts
import { Module } from '@nestjs/common';
import { ReposController } from './repos.controller';
import { ReposService } from './repos.service';

@Module({ controllers: [ReposController], providers: [ReposService], exports: [ReposService] })
export class ReposModule {}
```

- [ ] **Step 8: Run tests to confirm pass**

```bash
cd foreman
pnpm --filter @foreman/api test -- --testPathPattern="repos.service" --watchAll=false
```
Expected: PASS — 5 tests pass

- [ ] **Step 9: Commit**

```bash
cd foreman
git add apps/api/src/repos/
git commit -m "feat(api): add ReposModule with CRUD and verify endpoint"
```

---

### Task 2: SettingsModule — Key-Value with Masking

**Files:**
- Create: `foreman/apps/api/src/settings/dto/upsert-settings.dto.ts`
- Create: `foreman/apps/api/src/settings/settings.service.ts`
- Create: `foreman/apps/api/src/settings/settings.controller.ts`
- Create: `foreman/apps/api/src/settings/settings.module.ts`
- Test: `foreman/apps/api/src/settings/settings.service.spec.ts`

**Interfaces:**
- Produces:
  - `SettingsService.findAll(): Promise<Setting[]>` — masks values where `key` ends in `_token` or `_api_token` → `"***"`
  - `SettingsService.upsert(settings: Setting[]): Promise<Setting[]>` — upserts each row via `prisma.setting.upsert`
  - Routes: `GET /api/settings`, `PUT /api/settings`

- [ ] **Step 1: Write failing service test**

```typescript
// foreman/apps/api/src/settings/settings.service.spec.ts
import { Test } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  setting: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
};

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [SettingsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(SettingsService);
    jest.clearAllMocks();
  });

  it('masks token values on findAll', async () => {
    mockPrisma.setting.findMany.mockResolvedValue([
      { key: 'jira_api_token', value: 'secret' },
      { key: 'jira_base_url', value: 'https://org.atlassian.net' },
      { key: 'github_token', value: 'ghp_abc123' },
    ]);
    const result = await service.findAll();
    const tokenSetting = result.find((s) => s.key === 'jira_api_token');
    const urlSetting = result.find((s) => s.key === 'jira_base_url');
    const ghSetting = result.find((s) => s.key === 'github_token');
    expect(tokenSetting?.value).toBe('***');
    expect(urlSetting?.value).toBe('https://org.atlassian.net');
    expect(ghSetting?.value).toBe('***');
  });

  it('upserts each setting', async () => {
    mockPrisma.setting.upsert.mockResolvedValue({ key: 'jira_base_url', value: 'https://x.atlassian.net' });
    await service.upsert([{ key: 'jira_base_url', value: 'https://x.atlassian.net' }]);
    expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
      where: { key: 'jira_base_url' },
      create: { key: 'jira_base_url', value: 'https://x.atlassian.net' },
      update: { value: 'https://x.atlassian.net' },
    });
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd foreman
pnpm --filter @foreman/api test -- --testPathPattern="settings.service" --watchAll=false
```
Expected: FAIL

- [ ] **Step 3: Create upsert-settings.dto.ts**

```typescript
// foreman/apps/api/src/settings/dto/upsert-settings.dto.ts
import { IsArray, ValidateNested, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SettingItemDto {
  @IsString() key!: string;
  @IsString() value!: string;
}

export class UpsertSettingsDto {
  @ApiProperty({ type: [SettingItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettingItemDto)
  settings!: SettingItemDto[];
}
```

- [ ] **Step 4: Create settings.service.ts**

```typescript
// foreman/apps/api/src/settings/settings.service.ts
import { Injectable } from '@nestjs/common';
import type { Setting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SENSITIVE_PATTERN = /(_token|_api_token)$/;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Setting[]> {
    const settings = await this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
    return settings.map((s) => ({
      ...s,
      value: SENSITIVE_PATTERN.test(s.key) ? '***' : s.value,
    }));
  }

  async upsert(settings: { key: string; value: string }[]): Promise<Setting[]> {
    return Promise.all(
      settings.map((s) =>
        this.prisma.setting.upsert({
          where: { key: s.key },
          create: { key: s.key, value: s.value },
          update: { value: s.value },
        }),
      ),
    );
  }

  async getRaw(key: string): Promise<string | null> {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    return setting?.value ?? null;
  }
}
```

- [ ] **Step 5: Create settings.controller.ts**

```typescript
// foreman/apps/api/src/settings/settings.controller.ts
import { Controller, Get, Put, Body } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpsertSettingsDto } from './dto/upsert-settings.dto';

@ApiTags('settings')
@ApiSecurity('api-key')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'List all settings (sensitive values masked)' })
  findAll() { return this.settings.findAll(); }

  @Put()
  @ApiOperation({ summary: 'Upsert settings' })
  upsert(@Body() dto: UpsertSettingsDto) { return this.settings.upsert(dto.settings); }
}
```

- [ ] **Step 6: Create settings.module.ts**

```typescript
// foreman/apps/api/src/settings/settings.module.ts
import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({ controllers: [SettingsController], providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
```

- [ ] **Step 7: Run tests to confirm pass**

```bash
cd foreman
pnpm --filter @foreman/api test -- --testPathPattern="settings.service" --watchAll=false
```
Expected: PASS — 2 tests pass

- [ ] **Step 8: Commit**

```bash
cd foreman
git add apps/api/src/settings/
git commit -m "feat(api): add SettingsModule with sensitive-value masking"
```

---

### Task 3: TasksModule — CRUD + OrchestratorService Stub

**Files:**
- Create: `foreman/apps/api/src/tasks/dto/create-task.dto.ts`
- Create: `foreman/apps/api/src/tasks/tasks.service.ts`
- Create: `foreman/apps/api/src/tasks/orchestrator.service.ts`
- Create: `foreman/apps/api/src/tasks/tasks.controller.ts`
- Create: `foreman/apps/api/src/tasks/tasks.module.ts`
- Test: `foreman/apps/api/src/tasks/tasks.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (global)
- Produces:
  - `TasksService.findAll(): Promise<Task[]>`
  - `TasksService.findOne(id: string): Promise<Task>` — throws `NotFoundException('Task ${id} not found')`
  - `TasksService.create(dto: CreateTaskDto): Promise<Task>` — delegates enqueue to `OrchestratorService`
  - `TasksService.remove(id: string): Promise<void>` — only deletes if `status === 'queued'`, else throws `BadRequestException('Cannot delete a running or completed task')`
  - `OrchestratorService.enqueue(taskId: string): Promise<void>` — stub (BullMQ wired in Phase 4)
  - Routes: `GET /api/tasks`, `GET /api/tasks/:id`, `POST /api/tasks`, `DELETE /api/tasks/:id`

- [ ] **Step 1: Write failing service test**

```typescript
// foreman/apps/api/src/tasks/tasks.service.spec.ts
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { OrchestratorService } from './orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';

const fakeTask = {
  id: 'task-1',
  issueKey: 'MAH-42',
  title: 'Fix login bug',
  repoId: 'repo-1',
  agentType: 'bugfix',
  status: 'queued',
  round: 0,
  maxRounds: 5,
  log: '',
  mrUrl: null,
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  task: {
    findMany: jest.fn().mockResolvedValue([fakeTask]),
    findUnique: jest.fn().mockResolvedValue(fakeTask),
    create: jest.fn().mockResolvedValue(fakeTask),
    delete: jest.fn().mockResolvedValue(fakeTask),
  },
};

const mockOrchestrator = { enqueue: jest.fn().mockResolvedValue(undefined) };

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OrchestratorService, useValue: mockOrchestrator },
      ],
    }).compile();
    service = module.get(TasksService);
    jest.clearAllMocks();
    mockPrisma.task.findUnique.mockResolvedValue(fakeTask);
  });

  it('findAll returns array', async () => {
    mockPrisma.task.findMany.mockResolvedValue([fakeTask]);
    expect(await service.findAll()).toEqual([fakeTask]);
  });

  it('findOne throws for missing task', async () => {
    mockPrisma.task.findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('create stores task and enqueues', async () => {
    mockPrisma.task.create.mockResolvedValue(fakeTask);
    await service.create({ issueKey: 'MAH-42', title: 'Fix login bug', repoId: 'repo-1', agentType: 'bugfix' });
    expect(mockPrisma.task.create).toHaveBeenCalled();
    expect(mockOrchestrator.enqueue).toHaveBeenCalledWith('task-1');
  });

  it('remove deletes queued task', async () => {
    await service.remove('task-1');
    expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: 'task-1' } });
  });

  it('remove throws BadRequestException for non-queued task', async () => {
    mockPrisma.task.findUnique.mockResolvedValueOnce({ ...fakeTask, status: 'running' });
    await expect(service.remove('task-1')).rejects.toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd foreman
pnpm --filter @foreman/api test -- --testPathPattern="tasks.service" --watchAll=false
```
Expected: FAIL

- [ ] **Step 3: Create create-task.dto.ts**

```typescript
// foreman/apps/api/src/tasks/dto/create-task.dto.ts
import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AgentType } from '@foreman/types';

export class CreateTaskDto {
  @ApiProperty({ example: 'MAH-42' })
  @IsString() @IsNotEmpty() issueKey!: string;

  @ApiProperty({ example: 'Fix login redirect on mobile' })
  @IsString() @IsNotEmpty() title!: string;

  @ApiProperty({ example: 'repo-id-here' })
  @IsString() @IsNotEmpty() repoId!: string;

  @ApiProperty({ enum: ['feature', 'bugfix', 'support', 'improve'] })
  @IsEnum(['feature', 'bugfix', 'support', 'improve']) agentType!: AgentType;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(10) maxRounds?: number;
}
```

- [ ] **Step 4: Create orchestrator.service.ts (stub — BullMQ wired in Phase 4)**

```typescript
// foreman/apps/api/src/tasks/orchestrator.service.ts
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  async enqueue(taskId: string): Promise<void> {
    // BullMQ queue injection added in Phase 4 — WorkersModule
    this.logger.log(`Task ${taskId} queued (stub — wire BullMQ in Phase 4)`);
  }
}
```

- [ ] **Step 5: Create tasks.service.ts**

```typescript
// foreman/apps/api/src/tasks/tasks.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import type { Task } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrchestratorService } from './orchestrator.service';
import { CreateTaskDto } from './dto/create-task.dto';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  findAll(): Promise<Task[]> {
    return this.prisma.task.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  async create(dto: CreateTaskDto): Promise<Task> {
    const task = await this.prisma.task.create({
      data: {
        issueKey: dto.issueKey,
        title: dto.title,
        repoId: dto.repoId,
        agentType: dto.agentType as 'feature' | 'bugfix' | 'support' | 'improve',
        maxRounds: dto.maxRounds ?? 5,
        status: 'queued',
      },
    });
    await this.orchestrator.enqueue(task.id);
    this.logger.log(`Task ${task.id} created and enqueued`);
    return task;
  }

  async remove(id: string): Promise<void> {
    const task = await this.findOne(id);
    if (task.status !== 'queued') {
      throw new BadRequestException('Cannot delete a running or completed task');
    }
    await this.prisma.task.delete({ where: { id } });
  }
}
```

- [ ] **Step 6: Create tasks.controller.ts**

```typescript
// foreman/apps/api/src/tasks/tasks.controller.ts
import { Controller, Get, Post, Delete, Param, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';

@ApiTags('tasks')
@ApiSecurity('api-key')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'List all tasks' })
  findAll() { return this.tasks.findAll(); }

  @Get(':id')
  @ApiOperation({ summary: 'Get a task by ID' })
  findOne(@Param('id') id: string) { return this.tasks.findOne(id); }

  @Post()
  @ApiOperation({ summary: 'Create and enqueue a task' })
  create(@Body() dto: CreateTaskDto) { return this.tasks.create(dto); }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a queued task' })
  async remove(@Param('id') id: string) { await this.tasks.remove(id); }
}
```

- [ ] **Step 7: Create tasks.module.ts**

```typescript
// foreman/apps/api/src/tasks/tasks.module.ts
import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { OrchestratorService } from './orchestrator.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, OrchestratorService],
  exports: [OrchestratorService],
})
export class TasksModule {}
```

- [ ] **Step 8: Run tests to confirm pass**

```bash
cd foreman
pnpm --filter @foreman/api test -- --testPathPattern="tasks.service" --watchAll=false
```
Expected: PASS — 5 tests pass

- [ ] **Step 9: Commit**

```bash
cd foreman
git add apps/api/src/tasks/
git commit -m "feat(api): add TasksModule with CRUD and OrchestratorService stub"
```

---

### Task 4: AgentsModule + Wire All Modules into AppModule

**Files:**
- Create: `foreman/apps/api/src/agents/agents.registry.ts`
- Create: `foreman/apps/api/src/agents/agents.controller.ts`
- Create: `foreman/apps/api/src/agents/agents.module.ts`
- Modify: `foreman/apps/api/src/app.module.ts`

**Interfaces:**
- Produces:
  - `AgentsRegistry.getAll(): AgentConfig[]` — returns the 4 agent type descriptors (system prompts defined in Phase 4)
  - `GET /api/agent-types` → `AgentConfig[]`

- [ ] **Step 1: Create agents.registry.ts**

```typescript
// foreman/apps/api/src/agents/agents.registry.ts
import { Injectable } from '@nestjs/common';
import type { AgentConfig, AgentType } from '@foreman/types';

const FEATURE_SYSTEM_PROMPT = `You are Foreman's feature agent. Your job is to implement Jira feature tickets in the target repository.
Workflow:
1. Read the issue description and understand requirements.
2. Explore the codebase with list_directory and read_file.
3. Implement the feature with write_file, following the existing code style.
4. Run pnpm test (or npm test) with execute_command to confirm no regressions.
5. Create a pull request with create_pull_request summarizing what you built.
6. Call foreman_complete when done.
Always write tests for new code. Never commit secrets.`;

const BUGFIX_SYSTEM_PROMPT = `You are Foreman's bugfix agent. Your job is to fix bugs described in Jira tickets.
Workflow:
1. Reproduce the bug by reading relevant files and understanding the data flow.
2. Write a failing test that demonstrates the bug.
3. Fix the code so the test passes.
4. Run the full test suite with execute_command.
5. Create a pull request with a clear explanation of root cause and fix.
6. Call foreman_complete when done.`;

const SUPPORT_SYSTEM_PROMPT = `You are Foreman's support agent. Your job is to resolve support tickets — config changes, data fixes, or documentation updates.
Workflow:
1. Read the ticket and identify the exact change needed.
2. Make the minimal change: config file, docs, or data migration script.
3. Verify correctness with execute_command if applicable.
4. Create a pull request documenting the change and why.
5. Call foreman_complete when done.`;

const IMPROVE_SYSTEM_PROMPT = `You are Foreman's improvement agent. Your job is to apply code quality improvements from Jira tickets.
Workflow:
1. Read the improvement request and understand the goal.
2. Identify the files to change with list_directory and read_file.
3. Apply the improvement — refactor, optimize, or add observability.
4. Ensure all existing tests still pass.
5. Create a pull request describing the improvement and measurable outcomes.
6. Call foreman_complete when done.`;

const CONFIGS: Record<AgentType, AgentConfig> = {
  feature: {
    type: 'feature',
    systemPrompt: FEATURE_SYSTEM_PROMPT,
    allowedTools: ['read_file', 'write_file', 'list_directory', 'execute_command', 'create_pull_request', 'foreman_complete'],
    maxIterations: 30,
    successConditions: ['mr_created', 'no_build_errors'],
  },
  bugfix: {
    type: 'bugfix',
    systemPrompt: BUGFIX_SYSTEM_PROMPT,
    allowedTools: ['read_file', 'write_file', 'list_directory', 'execute_command', 'create_pull_request', 'foreman_complete'],
    maxIterations: 25,
    successConditions: ['mr_created', 'ci_passed'],
  },
  support: {
    type: 'support',
    systemPrompt: SUPPORT_SYSTEM_PROMPT,
    allowedTools: ['read_file', 'write_file', 'list_directory', 'execute_command', 'create_pull_request', 'foreman_complete'],
    maxIterations: 15,
    successConditions: ['mr_created'],
  },
  improve: {
    type: 'improve',
    systemPrompt: IMPROVE_SYSTEM_PROMPT,
    allowedTools: ['read_file', 'write_file', 'list_directory', 'execute_command', 'create_pull_request', 'foreman_complete'],
    maxIterations: 20,
    successConditions: ['mr_created', 'no_build_errors'],
  },
};

@Injectable()
export class AgentsRegistry {
  getAll(): AgentConfig[] {
    return Object.values(CONFIGS);
  }

  getConfig(type: AgentType): AgentConfig {
    return CONFIGS[type];
  }
}
```

- [ ] **Step 2: Create agents.controller.ts**

```typescript
// foreman/apps/api/src/agents/agents.controller.ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation } from '@nestjs/swagger';
import { AgentsRegistry } from './agents.registry';

@ApiTags('agents')
@ApiSecurity('api-key')
@Controller('agent-types')
export class AgentsController {
  constructor(private readonly registry: AgentsRegistry) {}

  @Get()
  @ApiOperation({ summary: 'List all agent type configurations' })
  findAll() { return this.registry.getAll(); }
}
```

- [ ] **Step 3: Create agents.module.ts**

```typescript
// foreman/apps/api/src/agents/agents.module.ts
import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsRegistry } from './agents.registry';

@Module({ controllers: [AgentsController], providers: [AgentsRegistry], exports: [AgentsRegistry] })
export class AgentsModule {}
```

- [ ] **Step 4: Update app.module.ts to import all domain modules**

```typescript
// foreman/apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { ReposModule } from './repos/repos.module';
import { SettingsModule } from './settings/settings.module';
import { TasksModule } from './tasks/tasks.module';
import { AgentsModule } from './agents/agents.module';
import { ApiKeyGuard } from './common/guards/api-key.guard';

@Module({
  imports: [PrismaModule, HealthModule, ReposModule, SettingsModule, TasksModule, AgentsModule],
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AppModule {}
```

- [ ] **Step 5: Run all API tests**

```bash
cd foreman
pnpm --filter @foreman/api test -- --watchAll=false
```
Expected: all tests pass

- [ ] **Step 6: Smoke test all routes (dev server)**

```bash
cd foreman/apps/api
API_KEY=test DATABASE_URL="postgresql://foreman:foreman@localhost:5432/foreman" \
  REDIS_URL="redis://localhost:6379" NODE_ENV=development pnpm dev &
sleep 5

curl -s -H "x-api-key: test" http://localhost:3001/api/repos | jq .
curl -s -H "x-api-key: test" http://localhost:3001/api/settings | jq .
curl -s -H "x-api-key: test" http://localhost:3001/api/tasks | jq .
curl -s -H "x-api-key: test" http://localhost:3001/api/agent-types | jq '.[].type'
```
Expected: `[]` for repos/settings/tasks, `"feature"\n"bugfix"\n"support"\n"improve"` for agent-types

Kill: `pkill -f "nest start"`

- [ ] **Step 7: Commit**

```bash
cd foreman
git add apps/api/src/agents/ apps/api/src/app.module.ts
git commit -m "feat(api): add AgentsModule and wire all domain modules into AppModule"
```

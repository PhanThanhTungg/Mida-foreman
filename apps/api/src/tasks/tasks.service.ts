import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import type { Task } from '@prisma/client';
import type { TaskProgressEvent, TaskProgressPhase, TaskProgressStatus } from '@foreman/types';
import { PrismaService } from '../prisma/prisma.service';
import { OrchestratorService } from './orchestrator.service';
import { ClaudeRunnerService } from '../workers/claude-runner.service';
import { WorkspaceLockService } from '../workers/repo-lock.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ForemanGateway } from '../gateway/foreman.gateway';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: OrchestratorService,
    private readonly runner: ClaudeRunnerService,
    private readonly lock: WorkspaceLockService,
    private readonly gateway: ForemanGateway,
  ) {}

  findAll(): Promise<Task[]> {
    return this.prisma.task.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  async findProgress(id: string): Promise<TaskProgressEvent[]> {
    await this.findOne(id);
    return this.prisma.taskProgressEvent.findMany({
      where: { taskId: id },
      orderBy: [{ round: 'asc' }, { createdAt: 'asc' }],
    });
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
    await this.recordProgress(task.id, 0, 'jira_fetch', 'skipped', 'Created manually');
    await this.recordProgress(task.id, 0, 'queued', 'started', 'Task queued');
    await this.orchestrator.enqueue(task.id);
    this.logger.log(`Task ${task.id} created and enqueued`);
    return task;
  }

  async retry(id: string): Promise<Task> {
    await this.findOne(id);
    const result = await this.prisma.task.updateMany({
      where: { id, status: { not: 'running' } },
      data: { status: 'queued', round: 0, log: '', error: null, mrUrl: null },
    });
    if (result.count === 0) {
      throw new BadRequestException('Cannot retry a running task');
    }
    await this.prisma.taskProgressEvent.deleteMany({ where: { taskId: id } });
    await this.recordProgress(id, 0, 'jira_fetch', 'skipped', 'Retry started manually');
    await this.recordProgress(id, 0, 'queued', 'started', 'Task queued for retry');
    await this.orchestrator.enqueue(id);
    this.logger.log(`Task ${id} retried`);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const task = await this.findOne(id);
    if (task.status === 'running') {
      this.runner.kill(id);
    }
    await this.prisma.task.delete({ where: { id } });
    this.logger.log(`Task ${id} deleted (was ${task.status})`);
  }

  private async recordProgress(
    taskId: string,
    round: number,
    phase: TaskProgressPhase,
    status: TaskProgressStatus,
    message = '',
  ): Promise<TaskProgressEvent> {
    const event = await this.prisma.taskProgressEvent.create({
      data: { taskId, round, phase, status, message },
    });
    this.gateway.emitProgress(taskId, event);
    return event;
  }
}

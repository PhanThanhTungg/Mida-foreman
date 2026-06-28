import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Logger, OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bull';
import type { AgentType, TaskProgressEvent, TaskProgressPhase, TaskProgressStatus } from '@foreman/types';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from '../repos/repos.service';
import { ClaudeRunnerService } from './claude-runner.service';
import { WorkspaceLockService } from './repo-lock.service';
import { SuccessObserverService } from './success-observer.service';
import { AgentsRegistry } from '../agents/agents.registry';
import { ForemanGateway } from '../gateway/foreman.gateway';

const REQUEUE_DELAY_MS = 60_000;
const MAX_PROGRESS_MESSAGE_LENGTH = 240;

@Processor('foreman-tasks')
export class TaskProcessor implements OnModuleInit {
  private readonly logger = new Logger(TaskProcessor.name);

  constructor(
    @InjectQueue('foreman-tasks') private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly repos: WorkspacesService,
    private readonly runner: ClaudeRunnerService,
    private readonly lock: WorkspaceLockService,
    private readonly observer: SuccessObserverService,
    private readonly registry: AgentsRegistry,
    private readonly gateway: ForemanGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    const stale = await this.prisma.task.findMany({ where: { status: 'running' } });
    for (const task of stale) {
      await this.lock.release(task.repoId);
      await this.prisma.task.update({ where: { id: task.id }, data: { status: 'queued' } });
      this.logger.warn(`Recovered stale task ${task.id} — released lock and re-queued`);
    }
  }

  @Process('process-task')
  async handleTask(job: Job<{ taskId: string }>): Promise<void> {
    const { taskId } = job.data;
    this.logger.log(`Processing task ${taskId}`);

    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) { this.logger.error(`Task ${taskId} not found`); return; }

    const acquired = await this.lock.acquire(task.repoId);
    if (!acquired) {
      this.logger.warn(`Workspace ${task.repoId} locked — requeueing task ${taskId}`);
      await this.recordProgress(taskId, task.round, 'queued', 'looped', 'Workspace is locked; task requeued');
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
      this.gateway.emitStatus(taskId, 'running', nextRound);
      await this.recordProgress(taskId, nextRound, 'queued', 'completed', `Round ${nextRound} started`);

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
        (line) => this.gateway.emitLog(taskId, line),
        (phase, status, message) => {
          return this.recordProgress(taskId, nextRound, phase, status, message).then(() => undefined);
        },
      );

      // Task may have been deleted while Claude was running
      const stillExists = await this.prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
      if (!stillExists) {
        this.logger.warn(`Task ${taskId} was deleted during execution, skipping status update`);
        return;
      }

      const succeeded = await this.observer.check(config.successConditions, result);

      const appendedLog = task.log
        ? `${task.log}\n--- Round ${nextRound} ---\n${result.log}`
        : `--- Round ${nextRound} ---\n${result.log}`;

      if (succeeded) {
        await this.recordProgress(taskId, nextRound, 'complete', 'completed', 'Task completed');
        await this.prisma.task.update({
          where: { id: taskId },
          data: { status: 'done', mrUrl: result.mrUrl, error: null, log: appendedLog },
        });
        this.gateway.emitStatus(taskId, 'done', nextRound);
        this.logger.log(`Task ${taskId} completed successfully`);
      } else if (nextRound >= task.maxRounds) {
        await this.recordProgress(taskId, nextRound, 'complete', 'failed', this.truncateMessage(result.error ?? 'Task failed'));
        await this.prisma.task.update({
          where: { id: taskId },
          data: { status: 'failed', error: result.error, log: appendedLog },
        });
        this.gateway.emitStatus(taskId, 'failed', nextRound);
        this.logger.warn(`Task ${taskId} failed after ${nextRound} rounds`);
      } else {
        await this.recordProgress(taskId, nextRound, 'queued', 'looped', this.truncateMessage(result.error ?? 'Round failed; scheduling another round'));
        await this.prisma.task.update({
          where: { id: taskId },
          data: { status: 'queued', error: result.error, log: appendedLog },
        });
        this.gateway.emitStatus(taskId, 'queued', nextRound);
        await this.queue.add('process-task', { taskId }, { attempts: 1 });
        this.logger.log(`Task ${taskId} round ${nextRound} failed — scheduling round ${nextRound + 1}`);
      }
    } finally {
      await this.lock.release(task.repoId);
    }
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

  private truncateMessage(message: string): string {
    const singleLine = message.replace(/\s+/g, ' ').trim();
    return singleLine.length > MAX_PROGRESS_MESSAGE_LENGTH
      ? `${singleLine.slice(0, MAX_PROGRESS_MESSAGE_LENGTH - 3)}...`
      : singleLine;
  }
}

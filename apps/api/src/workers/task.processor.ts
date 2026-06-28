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
import { ForemanGateway } from '../gateway/foreman.gateway';

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
    private readonly gateway: ForemanGateway,
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
      this.gateway.emitStatus(taskId, 'running', nextRound);

      const config = this.registry.getConfig(task.agentType as AgentType);
      const result = await this.runner.run(
        {
          taskId,
          repoPath: repo.path,
          githubRepo: repo.githubRepo,
          issueKey: task.issueKey,
          title: task.title,
          round: nextRound,
          previousError: task.error,
        },
        task.agentType as AgentType,
        (line) => this.gateway.emitLog(taskId, line),
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
        this.gateway.emitStatus(taskId, 'done', nextRound);
        this.logger.log(`Task ${taskId} completed successfully`);
      } else if (nextRound >= task.maxRounds) {
        await this.prisma.task.update({
          where: { id: taskId },
          data: { status: 'failed', error: result.error, log: appendedLog },
        });
        this.gateway.emitStatus(taskId, 'failed', nextRound);
        this.logger.warn(`Task ${taskId} failed after ${nextRound} rounds`);
      } else {
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
}

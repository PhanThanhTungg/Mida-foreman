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

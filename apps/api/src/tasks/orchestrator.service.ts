import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  async enqueue(taskId: string): Promise<void> {
    // BullMQ queue injection added in Phase 4 — WorkersModule
    this.logger.log(`Task ${taskId} queued (stub — wire BullMQ in Phase 4)`);
  }
}

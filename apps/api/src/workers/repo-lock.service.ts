import { Injectable, Inject, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

const LOCK_TTL_SECONDS = 1800;
const LOCK_PREFIX = 'workspace:lock:';

@Injectable()
export class WorkspaceLockService {
  private readonly logger = new Logger(WorkspaceLockService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async acquire(workspaceId: string): Promise<boolean> {
    const key = `${LOCK_PREFIX}${workspaceId}`;
    const result = await this.redis.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
    if (result === 'OK') {
      this.logger.log(`Lock acquired for workspace ${workspaceId}`);
      return true;
    }
    this.logger.warn(`Lock already held for workspace ${workspaceId} — requeueing`);
    return false;
  }

  async release(workspaceId: string): Promise<void> {
    await this.redis.del(`${LOCK_PREFIX}${workspaceId}`);
    this.logger.log(`Lock released for workspace ${workspaceId}`);
  }
}

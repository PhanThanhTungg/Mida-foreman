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

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
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'foreman-tasks' }),
    ReposModule,
    SettingsModule,
    AgentsModule,
    GatewayModule,
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

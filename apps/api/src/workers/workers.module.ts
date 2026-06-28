import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import Redis from 'ioredis';
import { TaskProcessor } from './task.processor';
import { ClaudeRunnerService } from './claude-runner.service';
import { WorkspaceLockService } from './repo-lock.service';
import { SuccessObserverService } from './success-observer.service';
import { WorkspacesModule } from '../repos/repos.module';
import { SettingsModule } from '../settings/settings.module';
import { AgentsModule } from '../agents/agents.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'foreman-tasks' }),
    WorkspacesModule,
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
    WorkspaceLockService,
    SuccessObserverService,
  ],
  exports: [ClaudeRunnerService, WorkspaceLockService],
})
export class WorkersModule {}

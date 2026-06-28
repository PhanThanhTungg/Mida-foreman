import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TaskProcessor } from './task.processor';
import { ClaudeRunnerService } from './claude-runner.service';
import { ToolExecutorService } from './tool-executor.service';
import { RepoLockService } from './repo-lock.service';
import { SuccessObserverService } from './success-observer.service';
import { ReposModule } from '../repos/repos.module';
import { SettingsModule } from '../settings/settings.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'foreman-tasks' }),
    ReposModule,
    SettingsModule,
    AgentsModule,
  ],
  providers: [
    TaskProcessor,
    ClaudeRunnerService,
    ToolExecutorService,
    RepoLockService,
    SuccessObserverService,
  ],
})
export class WorkersModule {}

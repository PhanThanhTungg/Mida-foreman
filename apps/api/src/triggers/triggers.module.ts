// foreman/apps/api/src/triggers/triggers.module.ts
import { Module } from '@nestjs/common';
import { JiraPollerService } from './jira-poller.service';
import { SettingsModule } from '../settings/settings.module';
import { WorkspacesModule } from '../repos/repos.module';
import { TasksModule } from '../tasks/tasks.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [SettingsModule, WorkspacesModule, TasksModule, GatewayModule],
  providers: [JiraPollerService],
})
export class TriggersModule {}

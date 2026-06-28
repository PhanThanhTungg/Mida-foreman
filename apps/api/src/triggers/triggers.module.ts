// foreman/apps/api/src/triggers/triggers.module.ts
import { Module } from '@nestjs/common';
import { JiraPollerService } from './jira-poller.service';
import { SettingsModule } from '../settings/settings.module';
import { ReposModule } from '../repos/repos.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [SettingsModule, ReposModule, TasksModule],
  providers: [JiraPollerService],
})
export class TriggersModule {}

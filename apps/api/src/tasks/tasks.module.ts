import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { OrchestratorService } from './orchestrator.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'foreman-tasks' })],
  controllers: [TasksController],
  providers: [TasksService, OrchestratorService],
  exports: [OrchestratorService],
})
export class TasksModule {}

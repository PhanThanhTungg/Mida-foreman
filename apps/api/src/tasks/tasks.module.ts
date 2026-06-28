import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { OrchestratorService } from './orchestrator.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, OrchestratorService],
  exports: [OrchestratorService],
})
export class TasksModule {}

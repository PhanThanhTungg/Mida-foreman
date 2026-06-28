import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { OrchestratorService } from './orchestrator.service';
import { WorkersModule } from '../workers/workers.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [BullModule.registerQueue({ name: 'foreman-tasks' }), WorkersModule, GatewayModule],
  controllers: [TasksController],
  providers: [TasksService, OrchestratorService],
  exports: [OrchestratorService],
})
export class TasksModule {}

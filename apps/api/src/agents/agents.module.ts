import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsRegistry } from './agents.registry';

@Module({ controllers: [AgentsController], providers: [AgentsRegistry], exports: [AgentsRegistry] })
export class AgentsModule {}

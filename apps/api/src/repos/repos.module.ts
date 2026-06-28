import { Module } from '@nestjs/common';
import { WorkspacesController } from './repos.controller';
import { WorkspacesService } from './repos.service';

@Module({ controllers: [WorkspacesController], providers: [WorkspacesService], exports: [WorkspacesService] })
export class WorkspacesModule {}

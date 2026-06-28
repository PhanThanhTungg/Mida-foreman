import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { existsSync, readdirSync } from 'fs';
import type { Repo } from '@prisma/client';
import type { WorkspaceVerifyResult } from '@foreman/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-repo.dto';
import { UpdateWorkspaceDto } from './dto/update-repo.dto';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Repo[]> {
    return this.prisma.repo.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<Repo> {
    const workspace = await this.prisma.repo.findUnique({ where: { id } });
    if (!workspace) throw new NotFoundException(`Workspace ${id} not found`);
    return workspace;
  }

  create(dto: CreateWorkspaceDto): Promise<Repo> {
    return this.prisma.repo.create({
      data: {
        name: dto.name,
        path: dto.path,
        description: dto.description ?? '',
      },
    });
  }

  async update(id: string, dto: UpdateWorkspaceDto): Promise<Repo> {
    await this.findOne(id);
    return this.prisma.repo.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.$transaction([
      this.prisma.task.deleteMany({ where: { repoId: id } }),
      this.prisma.repo.delete({ where: { id } }),
    ]);
  }

  async verify(id: string): Promise<WorkspaceVerifyResult> {
    const workspace = await this.findOne(id);
    const pathExists = existsSync(workspace.path);
    let subRepoCount = 0;

    if (pathExists) {
      try {
        const entries = readdirSync(workspace.path, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && existsSync(`${workspace.path}/${entry.name}/.git`)) {
            subRepoCount++;
          }
        }
      } catch {
        this.logger.warn(`Cannot scan workspace ${id} at ${workspace.path}`);
      }
    }

    return { pathExists, subRepoCount };
  }
}

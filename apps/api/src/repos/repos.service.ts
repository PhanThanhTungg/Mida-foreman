import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import type { Repo } from '@prisma/client';
import type { RepoVerifyResult } from '@foreman/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRepoDto } from './dto/create-repo.dto';
import { UpdateRepoDto } from './dto/update-repo.dto';

@Injectable()
export class ReposService {
  private readonly logger = new Logger(ReposService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Repo[]> {
    return this.prisma.repo.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<Repo> {
    const repo = await this.prisma.repo.findUnique({ where: { id } });
    if (!repo) throw new NotFoundException(`Repo ${id} not found`);
    return repo;
  }

  create(dto: CreateRepoDto): Promise<Repo> {
    return this.prisma.repo.create({
      data: {
        name: dto.name,
        path: dto.path,
        githubRepo: dto.githubRepo,
        description: dto.description ?? '',
      },
    });
  }

  async update(id: string, dto: UpdateRepoDto): Promise<Repo> {
    await this.findOne(id);
    return this.prisma.repo.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.repo.delete({ where: { id } });
  }

  async verify(id: string): Promise<RepoVerifyResult> {
    const repo = await this.findOne(id);
    const pathExists = existsSync(repo.path);
    let isGitRepo = false;
    let canGitStatus = false;

    if (pathExists) {
      isGitRepo = existsSync(`${repo.path}/.git`);
      try {
        execSync('git status', { cwd: repo.path, stdio: 'pipe' });
        canGitStatus = true;
      } catch {
        this.logger.warn(`git status failed for repo ${id} at ${repo.path}`);
      }
    }

    return { pathExists, isGitRepo, canGitStatus };
  }
}

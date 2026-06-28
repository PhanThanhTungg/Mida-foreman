import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ReposService } from './repos.service';
import { PrismaService } from '../prisma/prisma.service';

const fakeRepo = {
  id: 'repo-1',
  name: 'my-app',
  path: '/repos/my-app',
  githubRepo: 'org/my-app',
  description: '',
  active: true,
  createdAt: new Date(),
};

const mockPrisma = {
  repo: {
    findMany: jest.fn().mockResolvedValue([fakeRepo]),
    findUnique: jest.fn().mockResolvedValue(fakeRepo),
    create: jest.fn().mockResolvedValue(fakeRepo),
    update: jest.fn().mockResolvedValue(fakeRepo),
    delete: jest.fn().mockResolvedValue(fakeRepo),
  },
};

describe('ReposService', () => {
  let service: ReposService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ReposService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(ReposService);
    jest.clearAllMocks();
    mockPrisma.repo.findUnique.mockResolvedValue(fakeRepo);
  });

  it('findAll returns array', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeRepo]);
  });

  it('findOne returns repo', async () => {
    const result = await service.findOne('repo-1');
    expect(result.id).toBe('repo-1');
  });

  it('findOne throws NotFoundException for missing repo', async () => {
    mockPrisma.repo.findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('create delegates to prisma', async () => {
    await service.create({ name: 'my-app', path: '/repos/my-app', githubRepo: 'org/my-app' });
    expect(mockPrisma.repo.create).toHaveBeenCalledWith({
      data: { name: 'my-app', path: '/repos/my-app', githubRepo: 'org/my-app', description: '' },
    });
  });

  it('remove deletes repo', async () => {
    await service.remove('repo-1');
    expect(mockPrisma.repo.delete).toHaveBeenCalledWith({ where: { id: 'repo-1' } });
  });
});

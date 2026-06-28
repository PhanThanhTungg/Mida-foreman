import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WorkspacesService } from './repos.service';
import { PrismaService } from '../prisma/prisma.service';

const fakeWorkspace = {
  id: 'ws-1',
  name: 'my-projects',
  path: '/home/user/projects',
  description: '',
  active: true,
  createdAt: new Date(),
};

const mockPrisma = {
  repo: {
    findMany: jest.fn().mockResolvedValue([fakeWorkspace]),
    findUnique: jest.fn().mockResolvedValue(fakeWorkspace),
    create: jest.fn().mockResolvedValue(fakeWorkspace),
    update: jest.fn().mockResolvedValue(fakeWorkspace),
    delete: jest.fn().mockResolvedValue(fakeWorkspace),
  },
  task: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  $transaction: jest.fn().mockImplementation(async (operations: unknown[]) => Promise.all(operations)),
};

describe('WorkspacesService', () => {
  let service: WorkspacesService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [WorkspacesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(WorkspacesService);
    jest.clearAllMocks();
    mockPrisma.repo.findUnique.mockResolvedValue(fakeWorkspace);
  });

  it('findAll returns array', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeWorkspace]);
  });

  it('findOne returns workspace', async () => {
    const result = await service.findOne('ws-1');
    expect(result.id).toBe('ws-1');
  });

  it('findOne throws NotFoundException for missing workspace', async () => {
    mockPrisma.repo.findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('create delegates to prisma without githubRepo', async () => {
    await service.create({ name: 'my-projects', path: '/home/user/projects' });
    expect(mockPrisma.repo.create).toHaveBeenCalledWith({
      data: { name: 'my-projects', path: '/home/user/projects', description: '' },
    });
  });

  it('remove deletes workspace', async () => {
    await service.remove('ws-1');
    expect(mockPrisma.task.deleteMany).toHaveBeenCalledWith({ where: { repoId: 'ws-1' } });
    expect(mockPrisma.repo.delete).toHaveBeenCalledWith({ where: { id: 'ws-1' } });
  });
});

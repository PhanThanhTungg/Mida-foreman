import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { OrchestratorService } from './orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';

const fakeTask = {
  id: 'task-1',
  issueKey: 'MAH-42',
  title: 'Fix login bug',
  repoId: 'repo-1',
  agentType: 'bugfix',
  status: 'queued',
  round: 0,
  maxRounds: 5,
  log: '',
  mrUrl: null,
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  task: {
    findMany: jest.fn().mockResolvedValue([fakeTask]),
    findUnique: jest.fn().mockResolvedValue(fakeTask),
    create: jest.fn().mockResolvedValue(fakeTask),
    delete: jest.fn().mockResolvedValue(fakeTask),
  },
};

const mockOrchestrator = { enqueue: jest.fn().mockResolvedValue(undefined) };

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OrchestratorService, useValue: mockOrchestrator },
      ],
    }).compile();
    service = module.get(TasksService);
    jest.clearAllMocks();
    mockPrisma.task.findUnique.mockResolvedValue(fakeTask);
  });

  it('findAll returns array', async () => {
    mockPrisma.task.findMany.mockResolvedValue([fakeTask]);
    expect(await service.findAll()).toEqual([fakeTask]);
  });

  it('findOne throws for missing task', async () => {
    mockPrisma.task.findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('create stores task and enqueues', async () => {
    mockPrisma.task.create.mockResolvedValue(fakeTask);
    await service.create({ issueKey: 'MAH-42', title: 'Fix login bug', repoId: 'repo-1', agentType: 'bugfix' });
    expect(mockPrisma.task.create).toHaveBeenCalled();
    expect(mockOrchestrator.enqueue).toHaveBeenCalledWith('task-1');
  });

  it('remove deletes queued task', async () => {
    await service.remove('task-1');
    expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: 'task-1' } });
  });

  it('remove throws BadRequestException for non-queued task', async () => {
    mockPrisma.task.findUnique.mockResolvedValueOnce({ ...fakeTask, status: 'running' });
    await expect(service.remove('task-1')).rejects.toThrow(BadRequestException);
  });
});

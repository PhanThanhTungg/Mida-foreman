import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { OrchestratorService } from './orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeRunnerService } from '../workers/claude-runner.service';
import { WorkspaceLockService } from '../workers/repo-lock.service';
import { ForemanGateway } from '../gateway/foreman.gateway';

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
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    delete: jest.fn().mockResolvedValue(fakeTask),
  },
  taskProgressEvent: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'progress-1', createdAt: new Date(), ...data })),
    deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
  },
};

const mockOrchestrator = { enqueue: jest.fn().mockResolvedValue(undefined) };
const mockRunner = { kill: jest.fn() };
const mockLock = { release: jest.fn() };
const mockGateway = { emitProgress: jest.fn() };

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OrchestratorService, useValue: mockOrchestrator },
        { provide: ClaudeRunnerService, useValue: mockRunner },
        { provide: WorkspaceLockService, useValue: mockLock },
        { provide: ForemanGateway, useValue: mockGateway },
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
    expect(mockPrisma.taskProgressEvent.create).toHaveBeenCalledWith({
      data: { taskId: 'task-1', round: 0, phase: 'jira_fetch', status: 'skipped', message: 'Created manually' },
    });
    expect(mockPrisma.taskProgressEvent.create).toHaveBeenCalledWith({
      data: { taskId: 'task-1', round: 0, phase: 'queued', status: 'started', message: 'Task queued' },
    });
    expect(mockOrchestrator.enqueue).toHaveBeenCalledWith('task-1');
  });

  it('findProgress returns task progress events', async () => {
    await service.findProgress('task-1');
    expect(mockPrisma.taskProgressEvent.findMany).toHaveBeenCalledWith({
      where: { taskId: 'task-1' },
      orderBy: [{ round: 'asc' }, { createdAt: 'asc' }],
    });
  });

  it('retry resets task and progress before enqueueing', async () => {
    await service.retry('task-1');
    expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
      where: { id: 'task-1', status: { not: 'running' } },
      data: { status: 'queued', round: 0, log: '', error: null, mrUrl: null },
    });
    expect(mockPrisma.taskProgressEvent.deleteMany).toHaveBeenCalledWith({ where: { taskId: 'task-1' } });
    expect(mockOrchestrator.enqueue).toHaveBeenCalledWith('task-1');
  });

  it('retry rejects running task', async () => {
    mockPrisma.task.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.retry('task-1')).rejects.toThrow(BadRequestException);
  });

  it('remove deletes queued task', async () => {
    await service.remove('task-1');
    expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: 'task-1' } });
  });

  it('remove kills running task before deleting', async () => {
    mockPrisma.task.findUnique.mockResolvedValueOnce({ ...fakeTask, status: 'running' });
    await service.remove('task-1');
    expect(mockRunner.kill).toHaveBeenCalledWith('task-1');
    expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: 'task-1' } });
  });
});

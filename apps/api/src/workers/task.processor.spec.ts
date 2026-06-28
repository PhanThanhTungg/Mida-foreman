import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { TaskProcessor } from './task.processor';
import { ClaudeRunnerService } from './claude-runner.service';
import { WorkspaceLockService } from './repo-lock.service';
import { SuccessObserverService } from './success-observer.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from '../repos/repos.service';
import { AgentsRegistry } from '../agents/agents.registry';
import { ForemanGateway } from '../gateway/foreman.gateway';

const taskId = 'task-abc';
const repoId = 'ws-1';
const fakeTask = { id: taskId, issueKey: 'MAH-1', title: 'Fix X', repoId, agentType: 'bugfix', status: 'queued', round: 0, maxRounds: 2, log: '', mrUrl: null, error: null };
const fakeWorkspace = { id: repoId, path: '/home/user/projects', name: 'my-projects', active: true };

const mockPrisma = {
  task: {
    findUnique: jest.fn().mockResolvedValue(fakeTask),
    update: jest.fn().mockImplementation(async ({ data }) => ({ ...fakeTask, ...data })),
  },
  taskProgressEvent: {
    create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'progress-1', createdAt: new Date(), ...data })),
  },
};
const mockRunner = { run: jest.fn() };
const mockLock = { acquire: jest.fn().mockResolvedValue(true), release: jest.fn() };
const mockObserver = { check: jest.fn().mockResolvedValue(true) };
const mockWorkspaces = { findOne: jest.fn().mockResolvedValue(fakeWorkspace) };
const mockQueue = { add: jest.fn() };
const mockRegistry = { getConfig: jest.fn().mockReturnValue({ successConditions: ['mr_created'] }) };
const mockGateway = { emitLog: jest.fn(), emitStatus: jest.fn(), emitProgress: jest.fn() };

describe('TaskProcessor', () => {
  let processor: TaskProcessor;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TaskProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClaudeRunnerService, useValue: mockRunner },
        { provide: WorkspaceLockService, useValue: mockLock },
        { provide: SuccessObserverService, useValue: mockObserver },
        { provide: WorkspacesService, useValue: mockWorkspaces },
        { provide: AgentsRegistry, useValue: mockRegistry },
        { provide: ForemanGateway, useValue: mockGateway },
        { provide: getQueueToken('foreman-tasks'), useValue: mockQueue },
      ],
    }).compile();
    processor = module.get(TaskProcessor);
    jest.clearAllMocks();
    mockPrisma.task.findUnique.mockResolvedValue(fakeTask);
    mockLock.acquire.mockResolvedValue(true);
    mockObserver.check.mockResolvedValue(true);
    mockRunner.run.mockResolvedValue({ success: true, mrUrl: 'https://github.com/pr/1', error: null, log: 'done' });
    mockRegistry.getConfig.mockReturnValue({ successConditions: ['mr_created'] });
  });

  it('marks task done when agent succeeds and conditions pass', async () => {
    await processor.handleTask({ data: { taskId } } as never);
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'done' }) }),
    );
    expect(mockPrisma.taskProgressEvent.create).toHaveBeenCalledWith({
      data: { taskId, round: 1, phase: 'queued', status: 'completed', message: 'Round 1 started' },
    });
    expect(mockPrisma.taskProgressEvent.create).toHaveBeenCalledWith({
      data: { taskId, round: 1, phase: 'complete', status: 'completed', message: 'Task completed' },
    });
  });

  it('requeues with delay if lock not acquired', async () => {
    mockLock.acquire.mockResolvedValueOnce(false);
    await processor.handleTask({ data: { taskId } } as never);
    expect(mockPrisma.taskProgressEvent.create).toHaveBeenCalledWith({
      data: { taskId, round: 0, phase: 'queued', status: 'looped', message: 'Workspace is locked; task requeued' },
    });
    expect(mockQueue.add).toHaveBeenCalledWith('process-task', { taskId }, expect.objectContaining({ delay: expect.any(Number) }));
    expect(mockRunner.run).not.toHaveBeenCalled();
  });

  it('marks task failed after maxRounds exhausted', async () => {
    mockRunner.run.mockResolvedValue({ success: false, mrUrl: null, error: 'boom', log: 'fail' });
    mockObserver.check.mockResolvedValue(false);
    mockPrisma.task.findUnique
      .mockResolvedValueOnce({ ...fakeTask, round: 1 })
      .mockResolvedValueOnce({ ...fakeTask, round: 2, maxRounds: 2 });
    await processor.handleTask({ data: { taskId } } as never);
    const lastCall = mockPrisma.task.update.mock.calls.at(-1);
    expect(lastCall?.[0]?.data?.status).toBe('failed');
    expect(mockPrisma.taskProgressEvent.create).toHaveBeenCalledWith({
      data: { taskId, round: 2, phase: 'complete', status: 'failed', message: 'boom' },
    });
  });

  it('records loop event when another round is scheduled', async () => {
    mockRunner.run.mockResolvedValue({ success: false, mrUrl: null, error: 'needs another pass', log: 'fail' });
    mockObserver.check.mockResolvedValue(false);
    await processor.handleTask({ data: { taskId } } as never);
    expect(mockPrisma.taskProgressEvent.create).toHaveBeenCalledWith({
      data: { taskId, round: 1, phase: 'queued', status: 'looped', message: 'needs another pass' },
    });
    expect(mockQueue.add).toHaveBeenCalledWith('process-task', { taskId }, { attempts: 1 });
  });
});

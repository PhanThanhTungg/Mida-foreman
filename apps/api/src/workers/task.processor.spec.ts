import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { TaskProcessor } from './task.processor';
import { ClaudeRunnerService } from './claude-runner.service';
import { RepoLockService } from './repo-lock.service';
import { SuccessObserverService } from './success-observer.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReposService } from '../repos/repos.service';
import { AgentsRegistry } from '../agents/agents.registry';

const taskId = 'task-abc';
const repoId = 'repo-1';
const fakeTask = { id: taskId, issueKey: 'MAH-1', title: 'Fix X', repoId, agentType: 'bugfix', status: 'queued', round: 0, maxRounds: 2, log: '', mrUrl: null, error: null };
const fakeRepo = { id: repoId, path: '/repos/my-app', githubRepo: 'org/my-app', name: 'my-app', active: true };

const mockPrisma = {
  task: {
    findUnique: jest.fn().mockResolvedValue(fakeTask),
    update: jest.fn().mockImplementation(async ({ data }) => ({ ...fakeTask, ...data })),
  },
};
const mockRunner = { run: jest.fn() };
const mockLock = { acquire: jest.fn().mockResolvedValue(true), release: jest.fn() };
const mockObserver = { check: jest.fn().mockResolvedValue(true) };
const mockRepos = { findOne: jest.fn().mockResolvedValue(fakeRepo) };
const mockQueue = { add: jest.fn() };
const mockRegistry = { getConfig: jest.fn().mockReturnValue({ successConditions: ['mr_created'] }) };

describe('TaskProcessor', () => {
  let processor: TaskProcessor;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TaskProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClaudeRunnerService, useValue: mockRunner },
        { provide: RepoLockService, useValue: mockLock },
        { provide: SuccessObserverService, useValue: mockObserver },
        { provide: ReposService, useValue: mockRepos },
        { provide: AgentsRegistry, useValue: mockRegistry },
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
  });

  it('requeues with delay if lock not acquired', async () => {
    mockLock.acquire.mockResolvedValueOnce(false);
    await processor.handleTask({ data: { taskId } } as never);
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
  });
});

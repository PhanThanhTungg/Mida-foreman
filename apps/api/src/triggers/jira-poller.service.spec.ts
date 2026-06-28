import { Test } from '@nestjs/testing';
import { JiraPollerService } from './jira-poller.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { WorkspacesService } from '../repos/repos.service';
import { OrchestratorService } from '../tasks/orchestrator.service';
import { ForemanGateway } from '../gateway/foreman.gateway';

const fakeRepo = { id: 'repo-1', name: 'web', path: '/repos/web', description: '', active: true, createdAt: new Date() };
const fakeTask = {
  id: 'task-1',
  issueKey: 'MAH-42',
  title: 'Fix login',
  repoId: fakeRepo.id,
  agentType: 'bugfix',
  status: 'queued',
  round: 0,
  maxRounds: 5,
  log: '',
  mrUrl: null,
  error: null,
};

const mockPrisma = {
  task: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(fakeTask),
  },
  taskProgressEvent: {
    create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'progress-1', createdAt: new Date(), ...data })),
  },
};
const mockSettings = {
  getRaw: jest.fn((key: string) => {
    const values: Record<string, string> = {
      jira_base_url: 'https://example.atlassian.net',
      jira_email: 'bot@example.com',
      jira_api_token: 'token',
    };
    return Promise.resolve(values[key] ?? null);
  }),
};
const mockRepos = { findAll: jest.fn().mockResolvedValue([fakeRepo]) };
const mockOrchestrator = { enqueue: jest.fn().mockResolvedValue(undefined) };
const mockGateway = { emitProgress: jest.fn() };

describe('JiraPollerService', () => {
  let service: JiraPollerService;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        JiraPollerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettings },
        { provide: WorkspacesService, useValue: mockRepos },
        { provide: OrchestratorService, useValue: mockOrchestrator },
        { provide: ForemanGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get(JiraPollerService);
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        issues: [
          {
            key: 'MAH-42',
            fields: {
              summary: 'Fix login',
              labels: ['agent:bugfix', 'workspace:web'],
            },
          },
        ],
      }),
    });
    global.fetch = fetchMock as never;
    jest.clearAllMocks();
    mockPrisma.task.findFirst.mockResolvedValue(null);
    mockPrisma.task.create.mockResolvedValue(fakeTask);
    mockRepos.findAll.mockResolvedValue([fakeRepo]);
  });

  it('creates Jira task progress events when a task is fetched', async () => {
    await service.poll();

    expect(mockPrisma.task.create).toHaveBeenCalledWith({
      data: {
        issueKey: 'MAH-42',
        title: 'Fix login',
        repoId: fakeRepo.id,
        agentType: 'bugfix',
        status: 'queued',
        maxRounds: 5,
      },
    });
    expect(mockPrisma.taskProgressEvent.create).toHaveBeenCalledWith({
      data: { taskId: 'task-1', round: 0, phase: 'jira_fetch', status: 'completed', message: 'Fetched MAH-42 from Jira' },
    });
    expect(mockPrisma.taskProgressEvent.create).toHaveBeenCalledWith({
      data: { taskId: 'task-1', round: 0, phase: 'queued', status: 'started', message: 'Task queued from Jira' },
    });
    expect(mockOrchestrator.enqueue).toHaveBeenCalledWith('task-1');
  });
});

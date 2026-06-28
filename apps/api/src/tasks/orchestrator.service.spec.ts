import { Test } from '@nestjs/testing';
import { OrchestratorService } from './orchestrator.service';
import { getQueueToken } from '@nestjs/bull';

const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

describe('OrchestratorService', () => {
  let service: OrchestratorService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrchestratorService,
        { provide: getQueueToken('foreman-tasks'), useValue: mockQueue },
      ],
    }).compile();
    service = module.get(OrchestratorService);
    jest.clearAllMocks();
  });

  it('adds a job to the foreman-tasks queue', async () => {
    await service.enqueue('task-abc');
    expect(mockQueue.add).toHaveBeenCalledWith(
      'process-task',
      { taskId: 'task-abc' },
      { attempts: 1, removeOnComplete: true, removeOnFail: false },
    );
  });
});

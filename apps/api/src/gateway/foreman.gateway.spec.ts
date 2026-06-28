// foreman/apps/api/src/gateway/foreman.gateway.spec.ts
import { Test } from '@nestjs/testing';
import { ForemanGateway } from './foreman.gateway';

const mockServer = { emit: jest.fn() };

describe('ForemanGateway', () => {
  let gateway: ForemanGateway;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ForemanGateway],
    }).compile();
    gateway = module.get(ForemanGateway);
    (gateway as unknown as { server: typeof mockServer }).server = mockServer;
    jest.clearAllMocks();
  });

  it('emitLog sends log message to all clients', () => {
    gateway.emitLog('task-1', 'Tool: read_file({"path":"src/index.ts"})');
    expect(mockServer.emit).toHaveBeenCalledWith('message', {
      type: 'log',
      taskId: 'task-1',
      line: 'Tool: read_file({"path":"src/index.ts"})',
    });
  });

  it('emitStatus sends status message to all clients', () => {
    gateway.emitStatus('task-1', 'running', 2);
    expect(mockServer.emit).toHaveBeenCalledWith('message', {
      type: 'status',
      taskId: 'task-1',
      status: 'running',
      round: 2,
    });
  });

  it('emitProgress sends progress message to all clients', () => {
    const event = {
      id: 'progress-1',
      taskId: 'task-1',
      round: 1,
      phase: 'plan' as const,
      status: 'started' as const,
      message: 'Planning implementation',
      createdAt: new Date(),
    };
    gateway.emitProgress('task-1', event);
    expect(mockServer.emit).toHaveBeenCalledWith('message', {
      type: 'progress',
      taskId: 'task-1',
      event,
    });
  });
});

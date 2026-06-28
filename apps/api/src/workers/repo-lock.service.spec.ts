import { Test } from '@nestjs/testing';
import { WorkspaceLockService } from './repo-lock.service';

const mockRedis = { set: jest.fn(), del: jest.fn() };

describe('WorkspaceLockService', () => {
  let service: WorkspaceLockService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WorkspaceLockService,
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();
    service = module.get(WorkspaceLockService);
    jest.clearAllMocks();
  });

  it('acquire returns true when SET NX succeeds', async () => {
    mockRedis.set.mockResolvedValue('OK');
    expect(await service.acquire('ws-1')).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith('workspace:lock:ws-1', '1', 'EX', 1800, 'NX');
  });

  it('acquire returns false when lock already held', async () => {
    mockRedis.set.mockResolvedValue(null);
    expect(await service.acquire('ws-1')).toBe(false);
  });

  it('release deletes the lock key', async () => {
    mockRedis.del.mockResolvedValue(1);
    await service.release('ws-1');
    expect(mockRedis.del).toHaveBeenCalledWith('workspace:lock:ws-1');
  });
});

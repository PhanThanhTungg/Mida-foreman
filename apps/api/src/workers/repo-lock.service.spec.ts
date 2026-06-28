import { Test } from '@nestjs/testing';
import { RepoLockService } from './repo-lock.service';

const mockRedis = { set: jest.fn(), del: jest.fn() };

describe('RepoLockService', () => {
  let service: RepoLockService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RepoLockService,
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();
    service = module.get(RepoLockService);
    jest.clearAllMocks();
  });

  it('acquire returns true when SET NX succeeds', async () => {
    mockRedis.set.mockResolvedValue('OK');
    expect(await service.acquire('repo-1')).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith('repo:lock:repo-1', '1', 'EX', 1800, 'NX');
  });

  it('acquire returns false when lock already held', async () => {
    mockRedis.set.mockResolvedValue(null);
    expect(await service.acquire('repo-1')).toBe(false);
  });

  it('release deletes the lock key', async () => {
    mockRedis.del.mockResolvedValue(1);
    await service.release('repo-1');
    expect(mockRedis.del).toHaveBeenCalledWith('repo:lock:repo-1');
  });
});

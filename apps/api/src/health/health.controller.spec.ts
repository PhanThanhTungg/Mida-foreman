import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    controller = module.get(HealthController);
  });

  it('returns ok when DB is reachable', async () => {
    const result = await controller.check();
    expect(result).toEqual({ status: 'ok' });
  });

  it('returns degraded when DB throws', async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const result = await controller.check();
    expect(result.status).toBe('degraded');
    expect(result.db).toBe('unreachable');
  });
});

import { Test } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  setting: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
};

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [SettingsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(SettingsService);
    jest.clearAllMocks();
  });

  it('masks token values on findAll', async () => {
    mockPrisma.setting.findMany.mockResolvedValue([
      { key: 'jira_api_token', value: 'secret' },
      { key: 'jira_base_url', value: 'https://org.atlassian.net' },
      { key: 'github_token', value: 'ghp_abc123' },
    ]);
    const result = await service.findAll();
    const tokenSetting = result.find((s) => s.key === 'jira_api_token');
    const urlSetting = result.find((s) => s.key === 'jira_base_url');
    const ghSetting = result.find((s) => s.key === 'github_token');
    expect(tokenSetting?.value).toBe('***');
    expect(urlSetting?.value).toBe('https://org.atlassian.net');
    expect(ghSetting?.value).toBe('***');
  });

  it('upserts each setting', async () => {
    mockPrisma.setting.upsert.mockResolvedValue({ key: 'jira_base_url', value: 'https://x.atlassian.net' });
    await service.upsert([{ key: 'jira_base_url', value: 'https://x.atlassian.net' }]);
    expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
      where: { key: 'jira_base_url' },
      create: { key: 'jira_base_url', value: 'https://x.atlassian.net' },
      update: { value: 'https://x.atlassian.net' },
    });
  });
});

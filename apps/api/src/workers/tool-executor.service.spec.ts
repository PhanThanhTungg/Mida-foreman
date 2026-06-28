import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { ToolExecutorService } from './tool-executor.service';
import { SettingsService } from '../settings/settings.service';

const mockSettings = { getRaw: jest.fn() };

describe('ToolExecutorService', () => {
  let service: ToolExecutorService;
  let tmpDir: string;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ToolExecutorService,
        { provide: SettingsService, useValue: mockSettings },
      ],
    }).compile();
    service = module.get(ToolExecutorService);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foreman-test-'));
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('read_file reads a file within repoPath', async () => {
    await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'hello world');
    const result = await service.execute('read_file', { path: 'hello.txt' }, tmpDir);
    expect(result).toBe('hello world');
  });

  it('read_file rejects path traversal', async () => {
    await expect(service.execute('read_file', { path: '../../etc/passwd' }, tmpDir)).rejects.toThrow(BadRequestException);
  });

  it('write_file creates a file', async () => {
    await service.execute('write_file', { path: 'new.ts', content: 'export const x = 1;' }, tmpDir);
    const content = await fs.readFile(path.join(tmpDir, 'new.ts'), 'utf-8');
    expect(content).toBe('export const x = 1;');
  });

  it('list_directory returns entries', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.ts'), '');
    const result = await service.execute('list_directory', { path: '.' }, tmpDir);
    const entries = JSON.parse(result) as { name: string; type: string }[];
    expect(entries.some((e) => e.name === 'a.ts')).toBe(true);
  });

  it('execute_command rejects non-whitelisted commands', async () => {
    await expect(service.execute('execute_command', { command: 'rm -rf /' }, tmpDir)).rejects.toThrow(BadRequestException);
  });

  it('foreman_complete returns DONE', async () => {
    const result = await service.execute('foreman_complete', {}, tmpDir);
    expect(result).toBe('DONE');
  });
});

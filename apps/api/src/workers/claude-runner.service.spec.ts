import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { Test } from '@nestjs/testing';
import { spawn } from 'child_process';
import { ClaudeRunnerService } from './claude-runner.service';
import { AgentsRegistry } from '../agents/agents.registry';
import { SettingsService } from '../settings/settings.service';

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: jest.fn(),
}));

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

class FakeChildProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = jest.fn(() => {
    setImmediate(() => this.emit('close', null));
    return true;
  });
}

const context = {
  taskId: 'task-abc12345',
  repoPath: '/repos/my-app',
  githubRepo: 'org/my-app',
  issueKey: 'MAH-42',
  title: 'Fix login redirect',
  round: 1,
  previousError: null,
};

const registry = {
  getConfig: jest.fn().mockReturnValue({ systemPrompt: 'system prompt' }),
};

const settings = {
  getRaw: jest.fn().mockResolvedValue('github-token'),
};

describe('ClaudeRunnerService', () => {
  let service: ClaudeRunnerService;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ClaudeRunnerService,
        { provide: AgentsRegistry, useValue: registry },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();

    service = module.get(ClaudeRunnerService);
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ html_url: 'https://github.com/org/my-app/pull/1' }),
    });
    global.fetch = fetchMock as never;
    jest.clearAllMocks();
    registry.getConfig.mockReturnValue({ systemPrompt: 'system prompt' });
    settings.getRaw.mockResolvedValue('github-token');
    delete process.env.CLAUDE_ALLOWED_TOOLS;
    delete process.env.CLAUDE_MAX_BUDGET_USD;
    delete process.env.CLAUDE_TIMEOUT_MS;
    delete process.env.CLAUDE_CLI_PATH;
    delete process.env.CLAUDE_PERMISSION_MODE;
  });

  it('fails clearly when Claude Code CLI is missing', async () => {
    mockSpawn.mockImplementationOnce(() => {
      const child = new FakeChildProcess();
      setImmediate(() => child.emit('error', new Error('spawn claude ENOENT')));
      return child as never;
    });

    const result = await service.run(context, 'bugfix');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Claude Code CLI is not installed');
  });

  it('fails clearly when Claude Code is not authenticated', async () => {
    queueProcess({ stdout: '2.1.195 (Claude Code)\n', code: 0 });
    queueProcess({ stdout: '{"loggedIn":false}\n', code: 0 });

    const result = await service.run(context, 'bugfix');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Claude Code CLI is not authenticated');
  });

  it('streams Claude logs and creates a PR when changes exist', async () => {
    queueProcess({ stdout: '2.1.195 (Claude Code)\n', code: 0 });
    queueProcess({ stdout: '{"loggedIn":true}\n', code: 0 });
    queueProcess({
      stdout: [
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Working on it' }] } }),
        JSON.stringify({ type: 'result', is_error: false, result: 'done', total_cost_usd: 0.01, duration_ms: 1000 }),
      ].join('\n') + '\n',
      stderr: 'minor warning\n',
      code: 0,
    });
    queueProcess({ stdout: ' M src/app.ts\n', code: 0 });
    queueProcess({ code: 0 });
    queueProcess({ code: 0 });
    queueProcess({ code: 0 });
    queueProcess({ code: 0 });
    queueProcess({ stdout: 'https://github.com/org/my-app/pull/1\n', code: 0 });

    const onLog = jest.fn();
    const result = await service.run(context, 'bugfix', onLog);

    expect(result.success).toBe(true);
    expect(result.mrUrl).toBe('https://github.com/org/my-app/pull/1');
    expect(onLog).toHaveBeenCalledWith('Claude: Working on it');
    expect(onLog).toHaveBeenCalledWith('[stderr] minor warning');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to GitHub API token when GitHub CLI cannot create the PR', async () => {
    queueProcess({ stdout: '2.1.195 (Claude Code)\n', code: 0 });
    queueProcess({ stdout: '{"loggedIn":true}\n', code: 0 });
    queueProcess({ stdout: JSON.stringify({ type: 'result', is_error: false }) + '\n', code: 0 });
    queueProcess({ stdout: ' M src/app.ts\n', code: 0 });
    queueProcess({ code: 0 });
    queueProcess({ code: 0 });
    queueProcess({ code: 0 });
    queueProcess({ code: 0 });
    queueProcess({ stderr: 'gh auth required\n', code: 1 });

    const result = await service.run(context, 'bugfix');

    expect(result.success).toBe(true);
    expect(result.mrUrl).toBe('https://github.com/org/my-app/pull/1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/org/my-app/pulls',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"head":"foreman/mah-42-taskabc"'),
      }),
    );
  });

  it('fails when Claude exits non-zero', async () => {
    queueProcess({ stdout: '2.1.195 (Claude Code)\n', code: 0 });
    queueProcess({ stdout: '{"loggedIn":true}\n', code: 0 });
    queueProcess({ stderr: 'boom\n', code: 1 });

    const result = await service.run(context, 'bugfix');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Claude Code exited with code 1');
  });

  it('fails when Claude succeeds but produces no changes', async () => {
    queueProcess({ stdout: '2.1.195 (Claude Code)\n', code: 0 });
    queueProcess({ stdout: '{"loggedIn":true}\n', code: 0 });
    queueProcess({ stdout: JSON.stringify({ type: 'result', is_error: false }) + '\n', code: 0 });
    queueProcess({ stdout: '', code: 0 });

    const result = await service.run(context, 'bugfix');

    expect(result.success).toBe(false);
    expect(result.error).toBe('No changes produced');
  });

  it('returns a compare URL when GitHub CLI and github_token are unavailable', async () => {
    settings.getRaw.mockResolvedValueOnce(null);
    queueProcess({ stdout: '2.1.195 (Claude Code)\n', code: 0 });
    queueProcess({ stdout: '{"loggedIn":true}\n', code: 0 });
    queueProcess({ stdout: JSON.stringify({ type: 'result', is_error: false }) + '\n', code: 0 });
    queueProcess({ stdout: ' M src/app.ts\n', code: 0 });
    queueProcess({ code: 0 });
    queueProcess({ code: 0 });
    queueProcess({ code: 0 });
    queueProcess({ code: 0 });
    queueProcess({ stderr: 'gh auth required\n', code: 1 });

    const result = await service.run(context, 'bugfix');

    expect(result.success).toBe(true);
    expect(result.mrUrl).toBe('https://github.com/org/my-app/compare/main...foreman%2Fmah-42-taskabc?expand=1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('kills Claude and fails on timeout', async () => {
    process.env.CLAUDE_TIMEOUT_MS = '1';
    queueProcess({ stdout: '2.1.195 (Claude Code)\n', code: 0 });
    queueProcess({ stdout: '{"loggedIn":true}\n', code: 0 });
    const claude = queueProcess({ autoClose: false });

    const result = await service.run(context, 'bugfix');

    expect(claude.kill).toHaveBeenCalledWith('SIGTERM');
    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });
});

function queueProcess({
  stdout = '',
  stderr = '',
  code = 0,
  autoClose = true,
}: {
  stdout?: string;
  stderr?: string;
  code?: number;
  autoClose?: boolean;
}): FakeChildProcess {
  const child = new FakeChildProcess();
  mockSpawn.mockImplementationOnce(() => child as never);

  if (autoClose) {
    setImmediate(() => {
      if (stdout) child.stdout.write(stdout);
      if (stderr) child.stderr.write(stderr);
      child.stdout.end();
      child.stderr.end();
      child.emit('close', code);
    });
  }

  return child;
}

import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import type { AgentType, AgentRunResult, RoundContext } from '@foreman/types';
import { AgentsRegistry } from '../agents/agents.registry';
import { SettingsService } from '../settings/settings.service';

const DEFAULT_CLAUDE_CLI_PATH = 'claude';
const DEFAULT_PERMISSION_MODE = 'auto';
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const PREFLIGHT_TIMEOUT_MS = 30 * 1000;

interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

interface ProcessOptions {
  cwd?: string;
  timeoutMs?: number;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
}

interface ClaudeResultEvent {
  type?: unknown;
  is_error?: unknown;
  result?: unknown;
  subtype?: unknown;
  total_cost_usd?: unknown;
  duration_ms?: unknown;
}

@Injectable()
export class ClaudeRunnerService {
  private readonly logger = new Logger(ClaudeRunnerService.name);

  constructor(
    private readonly registry: AgentsRegistry,
    private readonly settings: SettingsService,
  ) {}

  async run(context: RoundContext, agentType: AgentType, onLog?: (line: string) => void): Promise<AgentRunResult> {
    const config = this.registry.getConfig(agentType);
    const logLines: string[] = [];
    let finalResult: ClaudeResultEvent | null = null;

    const log = (line: string) => {
      logLines.push(line);
      this.logger.log(`[Task ${context.taskId}] ${line}`);
      onLog?.(line);
    };

    log(`=== Round ${context.round} start - ${agentType} Claude Code agent ===`);

    try {
      await this.preflight(log);

      const claudeResult = await this.runProcess(
        this.claudeCliPath,
        this.buildClaudeArgs(context, config.systemPrompt),
        {
          cwd: context.repoPath,
          timeoutMs: this.claudeTimeoutMs,
          onStdoutLine: (line) => {
            const parsed = this.parseClaudeStreamLine(line);
            if (parsed.resultEvent) finalResult = parsed.resultEvent;
            if (parsed.logLine) log(parsed.logLine);
          },
          onStderrLine: (line) => log(`[stderr] ${line}`),
        },
      );

      if (claudeResult.timedOut) {
        return this.failure(`Claude Code timed out after ${this.claudeTimeoutMs}ms`, logLines);
      }

      if (claudeResult.code !== 0) {
        return this.failure(
          `Claude Code exited with code ${claudeResult.code ?? 'unknown'}${claudeResult.stderr ? `: ${claudeResult.stderr}` : ''}`,
          logLines,
        );
      }

      const resultEvent = finalResult as ClaudeResultEvent | null;
      if (resultEvent?.is_error === true) {
        const message = typeof resultEvent.result === 'string' ? resultEvent.result : 'Claude Code reported an error';
        return this.failure(message, logLines);
      }

      log('Claude Code completed; checking repository changes');
      const mrUrl = await this.createPullRequestFromChanges(context, log);

      return { success: true, mrUrl, error: null, log: logLines.join('\n') };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`Runner error: ${message}`);
      return this.failure(message, logLines);
    }
  }

  private async preflight(log: (line: string) => void): Promise<void> {
    const version = await this.runProcess(this.claudeCliPath, ['--version'], { timeoutMs: PREFLIGHT_TIMEOUT_MS });
    if (version.timedOut || version.code !== 0) {
      throw new Error(`Claude Code CLI is not installed or not executable: ${version.stderr || version.stdout || 'no output'}`);
    }

    log(`Claude Code CLI: ${version.stdout.trim() || this.claudeCliPath}`);

    const auth = await this.runProcess(this.claudeCliPath, ['auth', 'status'], { timeoutMs: PREFLIGHT_TIMEOUT_MS });
    if (auth.timedOut || auth.code !== 0) {
      throw new Error(`Claude Code CLI is not authenticated: ${auth.stderr || auth.stdout || 'no output'}`);
    }

    if (!this.isClaudeLoggedIn(auth.stdout)) {
      throw new Error('Claude Code CLI is not authenticated. Run `claude auth login` on the worker host.');
    }

    log('Claude Code auth status OK');
  }

  private buildClaudeArgs(context: RoundContext, systemPrompt: string): string[] {
    const args = [
      '-p',
      this.buildUserPrompt(context),
      '--output-format',
      'stream-json',
      '--permission-mode',
      process.env.CLAUDE_PERMISSION_MODE ?? DEFAULT_PERMISSION_MODE,
      '--append-system-prompt',
      systemPrompt,
    ];

    if (process.env.CLAUDE_ALLOWED_TOOLS) {
      args.push('--allowedTools', process.env.CLAUDE_ALLOWED_TOOLS);
    }

    if (process.env.CLAUDE_MAX_BUDGET_USD) {
      args.push('--max-budget-usd', process.env.CLAUDE_MAX_BUDGET_USD);
    }

    return args;
  }

  private buildUserPrompt(context: RoundContext): string {
    const lines = [
      `Issue: ${context.issueKey}`,
      `Title: ${context.title}`,
      `Repository path: ${context.repoPath}`,
      `Round: ${context.round}`,
      '',
      'Work inside the current repository. Make the required code changes, add or update tests when appropriate, and run the most relevant verification command.',
      'Do not create a pull request. Foreman will create the branch, commit, push, and PR after you finish.',
      'When complete, provide a concise summary of files changed and verification performed.',
    ];

    if (context.previousError) {
      lines.push('', `Previous round failed with: ${context.previousError}`, 'Analyze that failure and try a different approach.');
    }

    return lines.join('\n');
  }

  private async createPullRequestFromChanges(context: RoundContext, log: (line: string) => void): Promise<string> {
    const status = await this.runGit(['status', '--porcelain'], context.repoPath);
    if (!status.stdout.trim()) {
      throw new Error('No changes produced');
    }

    const branch = this.buildBranchName(context);
    const commitMessage = this.buildCommitMessage(context);

    log(`Creating branch ${branch}`);
    await this.runGit(['checkout', '-B', branch], context.repoPath);

    log('Staging changes');
    await this.runGit(['add', '-A'], context.repoPath);

    log(`Committing changes: ${commitMessage}`);
    await this.runGit(['commit', '-m', commitMessage], context.repoPath);

    log(`Pushing branch ${branch}`);
    await this.runGit(['push', '-u', 'origin', branch], context.repoPath);

    log('Creating GitHub pull request');
    return this.createGitHubPullRequest(context.githubRepo, branch, commitMessage, this.buildPullRequestBody(context));
  }

  private async runGit(args: string[], cwd: string): Promise<ProcessResult> {
    const result = await this.runProcess('git', args, { cwd, timeoutMs: 120_000 });
    if (result.timedOut) {
      throw new Error(`git ${args.join(' ')} timed out`);
    }
    if (result.code !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout || `exit code ${result.code}`}`);
    }
    return result;
  }

  private async createGitHubPullRequest(githubRepo: string, branch: string, title: string, body: string): Promise<string> {
    const cliResult = await this.runProcess(
      'gh',
      ['pr', 'create', '--repo', githubRepo, '--head', branch, '--base', 'main', '--title', title, '--body', body],
      { timeoutMs: 120_000 },
    );

    if (!cliResult.timedOut && cliResult.code === 0) {
      const prUrl = this.extractGitHubUrl(cliResult.stdout);
      if (prUrl) return prUrl;
    }

    const token = await this.settings.getRaw('github_token');
    if (!token) {
      this.logger.warn(
        `gh pr create failed and github_token is not configured; returning compare URL instead: ${cliResult.stderr || cliResult.stdout || 'no output'}`,
      );
      return this.buildCompareUrl(githubRepo, branch);
    }

    const response = await fetch(`https://api.github.com/repos/${githubRepo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body, head: branch, base: 'main' }),
    });

    if (!response.ok) {
      throw new Error(`GitHub PR creation failed: ${response.status} ${await response.text()}`);
    }

    const pr = (await response.json()) as { html_url?: string };
    if (!pr.html_url) {
      throw new Error('GitHub PR creation response did not include html_url');
    }
    return pr.html_url;
  }

  private extractGitHubUrl(output: string): string | null {
    return output.match(/https:\/\/github\.com\/\S+/)?.[0] ?? null;
  }

  private buildCompareUrl(githubRepo: string, branch: string): string {
    return `https://github.com/${githubRepo}/compare/main...${encodeURIComponent(branch)}?expand=1`;
  }

  private runProcess(command: string, args: string[], options: ProcessOptions = {}): Promise<ProcessResult> {
    return new Promise((resolve) => {
      let child: ChildProcess;
      try {
        child = spawn(command, args, {
          cwd: options.cwd,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        resolve({
          code: null,
          stdout: '',
          stderr: err instanceof Error ? err.message : String(err),
          timedOut: false,
        });
        return;
      }

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;
      let stdoutBuffer = '';
      let stderrBuffer = '';

      const timeout = options.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
          }, options.timeoutMs)
        : null;

      const emitLines = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
        const text = chunk.toString('utf-8');
        if (stream === 'stdout') stdout += text;
        else stderr += text;

        let buffer = stream === 'stdout' ? stdoutBuffer : stderrBuffer;
        buffer += text;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (stream === 'stdout') options.onStdoutLine?.(trimmed);
          else options.onStderrLine?.(trimmed);
        }

        if (stream === 'stdout') stdoutBuffer = buffer;
        else stderrBuffer = buffer;
      };

      const finish = (code: number | null, extraError?: string) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);

        if (stdoutBuffer.trim()) options.onStdoutLine?.(stdoutBuffer.trim());
        if (stderrBuffer.trim()) options.onStderrLine?.(stderrBuffer.trim());

        resolve({
          code,
          stdout,
          stderr: extraError ? `${stderr}${stderr ? '\n' : ''}${extraError}` : stderr,
          timedOut,
        });
      };

      child.stdout?.on('data', (chunk: Buffer) => emitLines(chunk, 'stdout'));
      child.stderr?.on('data', (chunk: Buffer) => emitLines(chunk, 'stderr'));
      child.once('error', (err) => finish(null, err.message));
      child.once('close', (code) => finish(code));
    });
  }

  private parseClaudeStreamLine(line: string): { logLine: string | null; resultEvent: ClaudeResultEvent | null } {
    try {
      const parsed = JSON.parse(line) as ClaudeResultEvent & Record<string, unknown>;
      const logLine = this.formatClaudeEvent(parsed);
      return {
        logLine,
        resultEvent: parsed.type === 'result' ? parsed : null,
      };
    } catch {
      return { logLine: line, resultEvent: null };
    }
  }

  private formatClaudeEvent(event: ClaudeResultEvent & Record<string, unknown>): string | null {
    if (event.type === 'system') {
      const subtype = typeof event.subtype === 'string' ? event.subtype : 'event';
      return `Claude system: ${subtype}`;
    }

    if (event.type === 'assistant') {
      const text = this.extractAssistantText(event.message);
      return text ? `Claude: ${text}` : null;
    }

    if (event.type === 'result') {
      const summary = typeof event.result === 'string' && event.result.trim() ? ` - ${event.result.trim()}` : '';
      const cost = typeof event.total_cost_usd === 'number' ? ` cost=$${event.total_cost_usd.toFixed(4)}` : '';
      const duration = typeof event.duration_ms === 'number' ? ` duration=${event.duration_ms}ms` : '';
      return `Claude result: ${event.is_error === true ? 'error' : 'success'}${cost}${duration}${summary}`;
    }

    return null;
  }

  private extractAssistantText(message: unknown): string | null {
    if (!message || typeof message !== 'object' || !('content' in message)) return null;
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) return null;

    const text = content
      .map((block) => {
        if (!block || typeof block !== 'object') return null;
        const typed = block as { type?: unknown; text?: unknown; name?: unknown };
        if (typed.type === 'text' && typeof typed.text === 'string') return typed.text;
        if (typed.type === 'tool_use' && typeof typed.name === 'string') return `Using tool: ${typed.name}`;
        return null;
      })
      .filter((part): part is string => Boolean(part))
      .join('\n');

    return text || null;
  }

  private isClaudeLoggedIn(stdout: string): boolean {
    try {
      const parsed = JSON.parse(stdout) as { loggedIn?: unknown };
      return parsed.loggedIn === true;
    } catch {
      return stdout.includes('"loggedIn": true') || stdout.includes('"loggedIn":true');
    }
  }

  private buildBranchName(context: RoundContext): string {
    const issue = context.issueKey.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    const shortId = context.taskId.slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, '');
    return `foreman/${issue || 'task'}-${shortId || 'change'}`;
  }

  private buildCommitMessage(context: RoundContext): string {
    const title = context.title.replace(/\s+/g, ' ').trim();
    return `Foreman: ${context.issueKey} ${title}`.slice(0, 120);
  }

  private buildPullRequestBody(context: RoundContext): string {
    return [
      `Automated Foreman change for ${context.issueKey}.`,
      '',
      `Task: ${context.title}`,
      `Round: ${context.round}`,
      '',
      'Generated by Claude Code CLI through the Foreman worker.',
    ].join('\n');
  }

  private failure(error: string, logLines: string[]): AgentRunResult {
    return { success: false, mrUrl: null, error, log: logLines.join('\n') };
  }

  private get claudeCliPath(): string {
    return process.env.CLAUDE_CLI_PATH ?? DEFAULT_CLAUDE_CLI_PATH;
  }

  private get claudeTimeoutMs(): number {
    const configured = process.env.CLAUDE_TIMEOUT_MS;
    if (!configured) return DEFAULT_TIMEOUT_MS;
    const parsed = Number(configured);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
  }
}

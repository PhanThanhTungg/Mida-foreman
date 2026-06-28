import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import type { AgentType, AgentRunResult, RoundContext } from '@foreman/types';
import { AgentsRegistry } from '../agents/agents.registry';


const DEFAULT_CLAUDE_CLI_PATH = 'claude';
const DEFAULT_PERMISSION_MODE = 'auto';
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const PREFLIGHT_TIMEOUT_MS = 30 * 1000;

const A = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
} as const;

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

const SEP = `${A.dim}${'─'.repeat(64)}${A.reset}`;

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
  onSpawn?: (child: ChildProcess) => void;
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
  private readonly activeProcesses = new Map<string, ChildProcess>();

  constructor(private readonly registry: AgentsRegistry) {}

  kill(taskId: string): void {
    const proc = this.activeProcesses.get(taskId);
    if (proc) {
      proc.kill('SIGTERM');
      this.activeProcesses.delete(taskId);
      this.logger.log(`Sent SIGTERM to Claude process for task ${taskId}`);
    }
  }

  async run(context: RoundContext, agentType: AgentType, onLog?: (line: string) => void): Promise<AgentRunResult> {
    const config = this.registry.getConfig(agentType);
    const logLines: string[] = [];
    let finalResult: ClaudeResultEvent | null = null;

    const log = (line: string) => {
      logLines.push(line);
      this.logger.log(`[Task ${context.taskId}] ${stripAnsi(line)}`);
      onLog?.(line);
    };

    log(`${SEP}`);
    log(`${A.bold}${A.brightCyan}◆ Round ${context.round}${A.reset}  ${A.dim}${agentType} agent  ·  ${context.issueKey}${A.reset}`);

    try {
      await this.preflight(log);

      const claudeResult = await this.runProcess(
        this.claudeCliPath,
        this.buildClaudeArgs(context, config.systemPrompt),
        {
          cwd: context.repoPath,
          timeoutMs: this.claudeTimeoutMs,
          onSpawn: (child) => this.activeProcesses.set(context.taskId, child),
          onStdoutLine: (line) => {
            const parsed = this.parseClaudeStreamLine(line);
            if (parsed.resultEvent) finalResult = parsed.resultEvent;
            for (const logLine of parsed.logLines) log(logLine);
          },
          onStderrLine: (line) => log(`[stderr] ${line}`),
        },
      );
      this.activeProcesses.delete(context.taskId);

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

      log(`${A.dim}Checking repository changes…${A.reset}`);
      const mrUrl = await this.createPullRequestFromChanges(context, log);

      return { success: true, mrUrl, error: null, log: logLines.join('\n') };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`${A.brightRed}✗ Runner error: ${message}${A.reset}`);
      return this.failure(message, logLines);
    }
  }

  private async preflight(log: (line: string) => void): Promise<void> {
    const version = await this.runProcess(this.claudeCliPath, ['--version'], { timeoutMs: PREFLIGHT_TIMEOUT_MS });
    if (version.timedOut || version.code !== 0) {
      throw new Error(`Claude Code CLI is not installed or not executable: ${version.stderr || version.stdout || 'no output'}`);
    }

    log(`${A.dim}  CLI: ${version.stdout.trim() || this.claudeCliPath}${A.reset}`);

    const auth = await this.runProcess(this.claudeCliPath, ['auth', 'status'], { timeoutMs: PREFLIGHT_TIMEOUT_MS });
    if (auth.timedOut || auth.code !== 0) {
      throw new Error(`Claude Code CLI is not authenticated: ${auth.stderr || auth.stdout || 'no output'}`);
    }

    if (!this.isClaudeLoggedIn(auth.stdout)) {
      throw new Error('Claude Code CLI is not authenticated. Run `claude auth login` on the worker host.');
    }

    log(`${A.dim}  auth OK${A.reset}`);
  }

  private buildClaudeArgs(context: RoundContext, systemPrompt: string): string[] {
    const args = [
      '-p',
      this.buildUserPrompt(context),
      '--output-format',
      'stream-json',
      '--verbose',
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

    log(`${A.dim}  Creating branch ${A.reset}${A.brightYellow}${branch}${A.reset}`);
    await this.runGit(['checkout', '-B', branch], context.repoPath);

    log(`${A.dim}  Staging changes…${A.reset}`);
    await this.runGit(['add', '-A'], context.repoPath);

    log(`${A.dim}  Committing: ${commitMessage}${A.reset}`);
    await this.runGit(['commit', '-m', commitMessage], context.repoPath);

    log(`${A.dim}  Pushing ${branch}…${A.reset}`);
    await this.runGit(['push', '-u', 'origin', branch], context.repoPath);

    log(`${A.dim}  Creating pull request via gh CLI…${A.reset}`);
    const ghResult = await this.runProcess(
      'gh',
      ['pr', 'create', '--head', branch, '--base', 'main', '--title', commitMessage, '--body', this.buildPullRequestBody(context)],
      { cwd: context.repoPath, timeoutMs: 120_000 },
    );

    if (!ghResult.timedOut && ghResult.code === 0) {
      const prUrl = this.extractGitHubUrl(ghResult.stdout);
      if (prUrl) return prUrl;
    }

    throw new Error(`gh pr create failed: ${ghResult.stderr || ghResult.stdout || 'no output'}`);
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

  private extractGitHubUrl(output: string): string | null {
    return output.match(/https:\/\/github\.com\/\S+/)?.[0] ?? null;
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
        options.onSpawn?.(child);
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

  private parseClaudeStreamLine(line: string): { logLines: string[]; resultEvent: ClaudeResultEvent | null } {
    try {
      const parsed = JSON.parse(line) as ClaudeResultEvent & Record<string, unknown>;
      return {
        logLines: this.formatClaudeEvent(parsed),
        resultEvent: parsed.type === 'result' ? parsed : null,
      };
    } catch {
      return { logLines: [line], resultEvent: null };
    }
  }

  private formatClaudeEvent(event: Record<string, unknown>): string[] {
    switch (event.type) {
      case 'system': return this.fmtSystem(event);
      case 'assistant': return this.fmtAssistant(event);
      case 'user': return this.fmtUser(event);
      case 'result': return this.fmtResult(event);
      default: return [];
    }
  }

  private fmtSystem(event: Record<string, unknown>): string[] {
    if (event.subtype !== 'init') return [];
    const model = typeof event.model === 'string' ? event.model : '';
    const mode = typeof event.permissionMode === 'string' ? event.permissionMode : '';
    const cwd = typeof event.cwd === 'string' ? event.cwd : '';
    const tools = Array.isArray(event.tools) ? (event.tools as string[]).join(', ') : '';
    return [
      '',
      SEP,
      `${A.bold}${A.brightCyan}◆ ${model}${A.reset}${mode ? `  ${A.dim}·  ${mode}${A.reset}` : ''}`,
      cwd ? `${A.dim}  ${cwd}${A.reset}` : '',
      tools ? `${A.dim}  Tools: ${tools}${A.reset}` : '',
      SEP,
      '',
    ].filter(l => l !== '');
  }

  private fmtAssistant(event: Record<string, unknown>): string[] {
    const msg = event.message as Record<string, unknown> | null;
    if (!msg || !Array.isArray(msg.content)) return [];
    const lines: string[] = [];
    for (const block of msg.content as Array<Record<string, unknown>>) {
      if (block.type === 'text' && typeof block.text === 'string') {
        const text = block.text.trim();
        if (text) {
          lines.push(...text.split('\n').map(l => `${A.brightWhite}${l}${A.reset}`));
          lines.push('');
        }
      } else if (block.type === 'tool_use') {
        lines.push(...this.fmtToolUse(block));
      }
    }
    return lines;
  }

  private fmtToolUse(block: Record<string, unknown>): string[] {
    const name = typeof block.name === 'string' ? block.name : 'Unknown';
    const input = (block.input as Record<string, unknown>) ?? {};

    if (name === 'Bash') {
      const cmd = typeof input.command === 'string' ? input.command : JSON.stringify(input);
      return [`  ${A.dim}${A.bold}$${A.reset} ${A.yellow}${cmd}${A.reset}`];
    }

    let detail = '';
    const extra: string[] = [];
    const namePad = name.padEnd(14);

    switch (name) {
      case 'Read':
        detail = `${A.dim}${input.file_path ?? ''}${A.reset}`;
        break;
      case 'Write': {
        const bytes = typeof input.content === 'string' ? input.content.length : 0;
        detail = `${A.dim}${input.file_path ?? ''}${A.reset}`;
        extra.push(`       ${A.dim}↳ ${bytes} bytes${A.reset}`);
        break;
      }
      case 'Edit':
      case 'MultiEdit':
        detail = `${A.dim}${input.file_path ?? ''}${A.reset}`;
        break;
      case 'Glob':
        detail = `${A.dim}${input.pattern ?? ''}${A.reset}`;
        break;
      case 'Grep':
        detail = `${A.dim}${input.pattern ?? ''}${input.path ? `  in: ${input.path}` : ''}${A.reset}`;
        break;
      case 'LS':
        detail = `${A.dim}${input.path ?? ''}${A.reset}`;
        break;
      case 'WebFetch':
        detail = `${A.dim}${input.url ?? ''}${A.reset}`;
        break;
      case 'WebSearch':
        detail = `${A.dim}"${input.query ?? ''}"${A.reset}`;
        break;
      default:
        detail = `${A.dim}${JSON.stringify(input).slice(0, 80)}${A.reset}`;
    }

    return [
      `  ${A.cyan}⬡${A.reset} ${A.bold}${A.cyan}${namePad}${A.reset}  ${detail}`,
      ...extra,
    ];
  }

  private fmtUser(event: Record<string, unknown>): string[] {
    const msg = event.message as Record<string, unknown> | null;
    if (!msg || !Array.isArray(msg.content)) return [];
    const lines: string[] = [];
    for (const block of msg.content as Array<Record<string, unknown>>) {
      if (block.type !== 'tool_result') continue;
      const isError = block.is_error === true;
      const raw = block.content;
      let text = '';
      if (Array.isArray(raw)) {
        text = (raw as Array<Record<string, unknown>>)
          .filter(c => c.type === 'text' && typeof c.text === 'string')
          .map(c => c.text as string)
          .join('');
      } else if (typeof raw === 'string') {
        text = raw;
      }
      if (!text.trim()) continue;
      if (isError) {
        const errLines = text.trim().split('\n').slice(0, 12);
        lines.push(`       ${A.brightRed}✗${A.reset} ${A.red}${errLines.join(`\n         `)}${A.reset}`, '');
      } else {
        const count = text.trim().split('\n').length;
        lines.push(`       ${A.dim}↳ ${count} ${count === 1 ? 'line' : 'lines'}${A.reset}`);
      }
    }
    return lines;
  }

  private fmtResult(event: Record<string, unknown>): string[] {
    const isError = event.is_error === true;
    const cost = typeof event.total_cost_usd === 'number'
      ? `$${(event.total_cost_usd as number).toFixed(4)}`
      : '';
    const duration = typeof event.duration_ms === 'number'
      ? `${((event.duration_ms as number) / 1000).toFixed(1)}s`
      : '';
    const summary = typeof event.result === 'string' ? event.result.trim() : '';
    const meta = [cost, duration].filter(Boolean).join('  ·  ');
    const status = isError
      ? `${A.bold}${A.brightRed}✗  Failed${A.reset}`
      : `${A.bold}${A.brightGreen}✓  Done${A.reset}`;

    const lines = ['', SEP, `${status}${meta ? `  ${A.dim}·  ${meta}${A.reset}` : ''}`];
    if (summary) {
      lines.push('');
      lines.push(...summary.split('\n').map(l => `${A.dim}${l}${A.reset}`));
    }
    lines.push('');
    return lines;
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

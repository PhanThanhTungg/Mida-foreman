import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { execSync } from 'child_process';
import * as path from 'path';
import type { ToolName } from '@foreman/types';
import { SettingsService } from '../settings/settings.service';

const ALLOWED_COMMANDS = /^(git|npm|pnpm|tsc|node|npx)\s/;
const EXEC_TIMEOUT_MS = 120_000;

@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name);

  constructor(private readonly settings: SettingsService) {}

  async execute(
    toolName: ToolName,
    input: Record<string, unknown>,
    repoPath: string,
  ): Promise<string> {
    switch (toolName) {
      case 'read_file': return this.readFile(String(input.path), repoPath);
      case 'write_file': return this.writeFile(String(input.path), String(input.content), repoPath);
      case 'list_directory': return this.listDirectory(String(input.path ?? '.'), repoPath);
      case 'execute_command': return this.executeCommand(String(input.command), repoPath);
      case 'create_pull_request': return this.createPullRequest(input);
      case 'foreman_complete': return 'DONE';
    }
  }

  private resolveSafe(filePath: string, repoPath: string): string {
    const resolved = path.resolve(repoPath, filePath);
    if (!resolved.startsWith(path.resolve(repoPath))) {
      throw new BadRequestException(`Path traversal detected: ${filePath}`);
    }
    return resolved;
  }

  private async readFile(filePath: string, repoPath: string): Promise<string> {
    const full = this.resolveSafe(filePath, repoPath);
    return readFile(full, 'utf-8');
  }

  private async writeFile(filePath: string, content: string, repoPath: string): Promise<string> {
    const full = this.resolveSafe(filePath, repoPath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, 'utf-8');
    return `Written ${filePath}`;
  }

  private async listDirectory(dirPath: string, repoPath: string): Promise<string> {
    const full = this.resolveSafe(dirPath, repoPath);
    const entries = await readdir(full);
    const result = await Promise.all(
      entries.map(async (name) => {
        const s = await stat(path.join(full, name));
        return { name, type: s.isDirectory() ? 'dir' : 'file' };
      }),
    );
    return JSON.stringify(result, null, 2);
  }

  private executeCommand(command: string, repoPath: string): string {
    if (!ALLOWED_COMMANDS.test(command)) {
      throw new BadRequestException(`Command not allowed: ${command}. Must start with: git, npm, pnpm, tsc, node, npx`);
    }
    try {
      const output = execSync(command, {
        cwd: repoPath,
        timeout: EXEC_TIMEOUT_MS,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      return output;
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      return `COMMAND FAILED:\nstdout: ${e.stdout ?? ''}\nstderr: ${e.stderr ?? ''}\n${e.message ?? ''}`;
    }
  }

  private async createPullRequest(input: Record<string, unknown>): Promise<string> {
    const token = await this.settings.getRaw('github_token');
    if (!token) return 'ERROR: github_token not configured in settings';

    const githubRepo = String(input.repo ?? '');
    const title = String(input.title ?? 'Foreman: automated change');
    const body = String(input.body ?? '');
    const head = String(input.head ?? 'foreman/auto');
    const base = String(input.base ?? 'main');

    const response = await fetch(`https://api.github.com/repos/${githubRepo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body, head, base }),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`GitHub PR creation failed: ${response.status} ${text}`);
      return `ERROR creating PR: ${response.status} ${text}`;
    }

    const pr = (await response.json()) as { html_url: string; number: number };
    this.logger.log(`PR created: ${pr.html_url}`);
    return JSON.stringify({ url: pr.html_url, number: pr.number });
  }
}

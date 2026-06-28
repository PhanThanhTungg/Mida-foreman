import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import type { AgentType, AgentRunResult, RoundContext, ToolName } from '@foreman/types';
import { AgentsRegistry } from '../agents/agents.registry';
import { ToolExecutorService } from './tool-executor.service';

const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'read_file',
    description: 'Read a file from the repository. Path is relative to the repo root.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Relative file path' } },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file in the repository. Creates parent directories if needed.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and directories at a path relative to the repo root.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Directory path (default: ".")' } },
      required: [],
    },
  },
  {
    name: 'execute_command',
    description: 'Run a shell command (git, npm, pnpm, tsc, node, npx only) in the repo root.',
    input_schema: {
      type: 'object',
      properties: { command: { type: 'string', description: 'The command to execute' } },
      required: ['command'],
    },
  },
  {
    name: 'create_pull_request',
    description: 'Create a GitHub pull request for the changes made.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'GitHub repo in org/repo format' },
        title: { type: 'string' },
        body: { type: 'string' },
        head: { type: 'string', description: 'Source branch name' },
        base: { type: 'string', description: 'Target branch (default: main)' },
      },
      required: ['repo', 'title', 'body', 'head'],
    },
  },
  {
    name: 'foreman_complete',
    description: 'Signal that the task is complete. Call this when all work is done.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

@Injectable()
export class ClaudeRunnerService {
  private readonly logger = new Logger(ClaudeRunnerService.name);
  private readonly client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  constructor(
    private readonly registry: AgentsRegistry,
    private readonly tools: ToolExecutorService,
  ) {}

  async run(context: RoundContext, agentType: AgentType, onLog?: (line: string) => void): Promise<AgentRunResult> {
    const config = this.registry.getConfig(agentType);
    const logLines: string[] = [];
    let mrUrl: string | null = null;
    let completed = false;

    const allowed = new Set(config.allowedTools);
    const filteredTools = TOOL_DEFINITIONS.filter((t) => allowed.has(t.name as ToolName));

    const messages: MessageParam[] = [{ role: 'user', content: this.buildUserPrompt(context) }];

    const log = (line: string) => {
      logLines.push(line);
      this.logger.log(`[Task ${context.taskId}] ${line}`);
      onLog?.(line);
    };

    log(`=== Round ${context.round} start — ${agentType} agent ===`);

    try {
      for (let iteration = 0; iteration < config.maxIterations; iteration++) {
        const response = await this.client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          system: config.systemPrompt,
          tools: filteredTools,
          messages,
        });

        messages.push({ role: 'assistant', content: response.content });

        if (response.stop_reason === 'end_turn') {
          log('Agent reached end_turn without calling foreman_complete');
          break;
        }

        const toolUses = response.content.filter((b) => b.type === 'tool_use');
        if (toolUses.length === 0) break;

        const toolResults: MessageParam['content'] = [];

        for (const block of toolUses) {
          if (block.type !== 'tool_use') continue;
          const toolName = block.name as ToolName;
          const input = block.input as Record<string, unknown>;

          log(`Tool: ${toolName}(${JSON.stringify(input).slice(0, 120)})`);

          let toolOutput: string;
          try {
            toolOutput = await this.tools.execute(toolName, input, context.repoPath);
          } catch (err) {
            toolOutput = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
          }

          if (toolName === 'foreman_complete') {
            completed = true;
            log('foreman_complete called — task complete');
          }

          if (toolName === 'create_pull_request' && toolOutput.includes('"url"')) {
            try {
              const parsed = JSON.parse(toolOutput) as { url: string };
              mrUrl = parsed.url;
              log(`PR created: ${mrUrl}`);
            } catch { /* non-JSON response, continue */ }
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: toolOutput,
          });
        }

        messages.push({ role: 'user', content: toolResults });

        if (completed) break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`SDK error: ${message}`);
      return { success: false, mrUrl: null, error: message, log: logLines.join('\n') };
    }

    return {
      success: completed,
      mrUrl,
      error: completed ? null : 'Agent did not call foreman_complete',
      log: logLines.join('\n'),
    };
  }

  private buildUserPrompt(context: RoundContext): string {
    const lines = [
      `Issue: ${context.issueKey}`,
      `Title: ${context.title}`,
      `Repository path: ${context.repoPath}`,
      `Round: ${context.round}`,
    ];
    if (context.previousError) {
      lines.push(`\nPrevious round failed with: ${context.previousError}`);
      lines.push('Please analyze the error and try a different approach.');
    }
    return lines.join('\n');
  }
}

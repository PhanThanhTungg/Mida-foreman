import type { AgentType } from './task.types';

export type ToolName =
  | 'read_file'
  | 'write_file'
  | 'list_directory'
  | 'execute_command'
  | 'create_pull_request'
  | 'foreman_complete';

export type SuccessCondition = 'mr_created' | 'ci_passed' | 'no_build_errors';

export interface AgentConfig {
  type: AgentType;
  systemPrompt: string;
  successConditions: SuccessCondition[];
}

export interface AgentRunResult {
  success: boolean;
  mrUrl: string | null;
  error: string | null;
  log: string;
}

export interface RoundContext {
  taskId: string;
  repoPath: string;
  issueKey: string;
  title: string;
  round: number;
  previousError: string | null;
}

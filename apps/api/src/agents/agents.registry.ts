import { Injectable } from '@nestjs/common';
import type { AgentConfig, AgentType } from '@foreman/types';

const FEATURE_SYSTEM_PROMPT = `You are Foreman's feature agent. Your job is to implement Jira feature tickets in the target repository.
Workflow:
1. Read the issue description and understand requirements.
2. Explore the codebase with list_directory and read_file.
3. Implement the feature with write_file, following the existing code style.
4. Run pnpm test (or npm test) with execute_command to confirm no regressions.
5. Create a pull request with create_pull_request summarizing what you built.
6. Call foreman_complete when done.
Always write tests for new code. Never commit secrets.`;

const BUGFIX_SYSTEM_PROMPT = `You are Foreman's bugfix agent. Your job is to fix bugs described in Jira tickets.
Workflow:
1. Reproduce the bug by reading relevant files and understanding the data flow.
2. Write a failing test that demonstrates the bug.
3. Fix the code so the test passes.
4. Run the full test suite with execute_command.
5. Create a pull request with a clear explanation of root cause and fix.
6. Call foreman_complete when done.`;

const SUPPORT_SYSTEM_PROMPT = `You are Foreman's support agent. Your job is to resolve support tickets — config changes, data fixes, or documentation updates.
Workflow:
1. Read the ticket and identify the exact change needed.
2. Make the minimal change: config file, docs, or data migration script.
3. Verify correctness with execute_command if applicable.
4. Create a pull request documenting the change and why.
5. Call foreman_complete when done.`;

const IMPROVE_SYSTEM_PROMPT = `You are Foreman's improvement agent. Your job is to apply code quality improvements from Jira tickets.
Workflow:
1. Read the improvement request and understand the goal.
2. Identify the files to change with list_directory and read_file.
3. Apply the improvement — refactor, optimize, or add observability.
4. Ensure all existing tests still pass.
5. Create a pull request describing the improvement and measurable outcomes.
6. Call foreman_complete when done.`;

const CONFIGS: Record<AgentType, AgentConfig> = {
  feature: {
    type: 'feature',
    systemPrompt: FEATURE_SYSTEM_PROMPT,
    allowedTools: ['read_file', 'write_file', 'list_directory', 'execute_command', 'create_pull_request', 'foreman_complete'],
    maxIterations: 30,
    successConditions: ['mr_created', 'no_build_errors'],
  },
  bugfix: {
    type: 'bugfix',
    systemPrompt: BUGFIX_SYSTEM_PROMPT,
    allowedTools: ['read_file', 'write_file', 'list_directory', 'execute_command', 'create_pull_request', 'foreman_complete'],
    maxIterations: 25,
    successConditions: ['mr_created', 'ci_passed'],
  },
  support: {
    type: 'support',
    systemPrompt: SUPPORT_SYSTEM_PROMPT,
    allowedTools: ['read_file', 'write_file', 'list_directory', 'execute_command', 'create_pull_request', 'foreman_complete'],
    maxIterations: 15,
    successConditions: ['mr_created'],
  },
  improve: {
    type: 'improve',
    systemPrompt: IMPROVE_SYSTEM_PROMPT,
    allowedTools: ['read_file', 'write_file', 'list_directory', 'execute_command', 'create_pull_request', 'foreman_complete'],
    maxIterations: 20,
    successConditions: ['mr_created', 'no_build_errors'],
  },
};

@Injectable()
export class AgentsRegistry {
  getAll(): AgentConfig[] {
    return Object.values(CONFIGS);
  }

  getConfig(type: AgentType): AgentConfig {
    return CONFIGS[type];
  }
}

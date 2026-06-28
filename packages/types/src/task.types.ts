export type TaskStatus = 'queued' | 'running' | 'done' | 'failed';
export type AgentType = 'feature' | 'bugfix' | 'support' | 'improve';
export type TaskProgressPhase =
  | 'jira_fetch'
  | 'queued'
  | 'preflight'
  | 'understand'
  | 'plan'
  | 'code'
  | 'verify'
  | 'pr'
  | 'complete';
export type TaskProgressStatus = 'started' | 'completed' | 'failed' | 'skipped' | 'looped';

export interface Task {
  id: string;
  issueKey: string;
  title: string;
  repoId: string;
  agentType: AgentType;
  status: TaskStatus;
  round: number;
  maxRounds: number;
  log: string;
  mrUrl: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskProgressEvent {
  id: string;
  taskId: string;
  round: number;
  phase: TaskProgressPhase;
  status: TaskProgressStatus;
  message: string;
  createdAt: Date | string;
}

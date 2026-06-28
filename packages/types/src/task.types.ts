export type TaskStatus = 'queued' | 'running' | 'done' | 'failed';
export type AgentType = 'feature' | 'bugfix' | 'support' | 'improve';

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

export interface Workspace {
  id: string;
  name: string;
  path: string;
  description: string;
  active: boolean;
  createdAt: Date;
}

export interface WorkspaceVerifyResult {
  pathExists: boolean;
  subRepoCount: number;
}

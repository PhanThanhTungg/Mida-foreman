export interface Repo {
  id: string;
  name: string;
  path: string;
  githubRepo: string;
  description: string;
  active: boolean;
  createdAt: Date;
}

export interface RepoVerifyResult {
  pathExists: boolean;
  isGitRepo: boolean;
  canGitStatus: boolean;
}

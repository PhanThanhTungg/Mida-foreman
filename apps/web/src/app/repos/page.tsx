import { apiClient } from '@/lib/api-client';
import { RepoManager } from '@/components/repos/repo-manager';

export default async function ReposPage() {
  const repos = await apiClient.repos.list().catch(() => []);
  return <RepoManager initialRepos={repos} />;
}

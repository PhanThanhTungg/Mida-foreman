import { apiClient } from '@/lib/api-client';
import { WorkspaceManager } from '@/components/workspaces/workspace-manager';

export default async function WorkspacesPage() {
  const workspaces = await apiClient.workspaces.list().catch(() => []);
  return <WorkspaceManager initialWorkspaces={workspaces} />;
}

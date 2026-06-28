import { TasksClient } from './tasks-client';
import { apiClient } from '@/lib/api-client';

export default async function TasksPage() {
  const [tasks, workspaces] = await Promise.all([
    apiClient.tasks.list().catch(() => []),
    apiClient.workspaces.list().catch(() => []),
  ]);
  return <TasksClient initialTasks={tasks} initialWorkspaces={workspaces} />;
}

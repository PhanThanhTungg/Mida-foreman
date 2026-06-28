import { TasksClient } from './tasks-client';
import { apiClient } from '@/lib/api-client';

export default async function TasksPage() {
  const [tasks, repos] = await Promise.all([
    apiClient.tasks.list().catch(() => []),
    apiClient.repos.list().catch(() => []),
  ]);
  return <TasksClient initialTasks={tasks} initialRepos={repos} />;
}

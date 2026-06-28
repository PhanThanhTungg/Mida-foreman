'use client';
import { useState } from 'react';
import type { Task, Repo } from '@foreman/types';
import { useTasks } from '@/hooks/use-tasks';
import { useRepos } from '@/hooks/use-repos';
import { TaskForm } from '@/components/tasks/task-form';
import { TaskList } from '@/components/tasks/task-list';
import { LogViewer } from '@/components/tasks/log-viewer';

interface Props { initialTasks: Task[]; initialRepos: Repo[]; }

export function TasksClient({ initialTasks, initialRepos }: Props) {
  const { tasks, mutate } = useTasks();
  const { repos } = useRepos();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const allTasks = tasks.length > 0 ? tasks : initialTasks;
  const allRepos = repos.length > 0 ? repos : initialRepos;
  const selectedTask = allTasks.find((t) => t.id === selectedId);

  return (
    <div className="flex gap-4 h-[calc(100vh-80px)]">
      <div className="w-96 flex-none flex flex-col gap-4 overflow-y-auto">
        <TaskForm repos={allRepos} onCreated={mutate} />
        <TaskList tasks={allTasks} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className="flex-1 min-h-0">
        <LogViewer taskId={selectedId} initialLog={selectedTask?.log ?? ''} />
      </div>
    </div>
  );
}

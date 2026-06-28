'use client';
import { useState } from 'react';
import type { Task, Workspace } from '@foreman/types';
import { useTasks } from '@/hooks/use-tasks';
import { useWorkspaces } from '@/hooks/use-workspaces';
import { TaskForm } from '@/components/tasks/task-form';
import { TaskList } from '@/components/tasks/task-list';
import { TaskDetailTabs } from '@/components/tasks/task-detail-tabs';
import { apiClient } from '@/lib/api-client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props { initialTasks: Task[]; initialWorkspaces: Workspace[]; }

export function TasksClient({ initialTasks, initialWorkspaces }: Props) {
  const { tasks, mutate } = useTasks();
  const { workspaces } = useWorkspaces();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const allTasks = tasks.length > 0 ? tasks : initialTasks;
  const allWorkspaces = workspaces.length > 0 ? workspaces : initialWorkspaces;
  const selectedTask = allTasks.find((t) => t.id === selectedId);
  const pendingDeleteTask = allTasks.find((t) => t.id === pendingDeleteId);

  const handleRetry = async (id: string) => {
    if (retryingId) return;
    setRetryingId(id);
    try {
      await apiClient.tasks.retry(id);
      mutate();
    } catch (err) {
      console.error('Retry failed:', err);
    } finally {
      setRetryingId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteId || deletingId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    setDeletingId(id);
    try {
      await apiClient.tasks.delete(id);
      if (selectedId === id) setSelectedId(null);
      mutate();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <div className="flex h-[calc(100vh-46px)] min-h-0 flex-col bg-black text-slate-100 lg:flex-row">
        <aside className="flex min-h-0 flex-none flex-col overflow-hidden border-r border-[#20262e] bg-black lg:w-[322px]">
          <TaskForm workspaces={allWorkspaces} onCreated={mutate} />
          <div className="scrollbar-foreman min-h-0 flex-1 overflow-auto">
            <TaskList
              tasks={allTasks}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onRetry={handleRetry}
              retryingId={retryingId}
              onDelete={setPendingDeleteId}
              deletingId={deletingId}
            />
          </div>
        </aside>
        <section className="min-h-0 flex-1 bg-black">
          <TaskDetailTabs task={selectedTask ?? null} />
        </section>
      </div>

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <AlertDialogContent className="border-[#27313d] bg-[#090d12]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Delete task?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {pendingDeleteTask?.status === 'running'
                ? `Task "${pendingDeleteTask?.issueKey}" is currently running. Deleting it will kill the Claude process immediately.`
                : `Task "${pendingDeleteTask?.issueKey}" will be permanently deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#27313d] bg-[#0d131a] text-slate-300 hover:bg-[#141c26]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-700 text-white hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

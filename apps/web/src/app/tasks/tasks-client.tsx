'use client';
import { useState } from 'react';
import type { Task, Workspace } from '@foreman/types';
import { useTasks } from '@/hooks/use-tasks';
import { useWorkspaces } from '@/hooks/use-workspaces';
import { TaskForm } from '@/components/tasks/task-form';
import { TaskList } from '@/components/tasks/task-list';
import { LogViewer } from '@/components/tasks/log-viewer';
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
      <div className="flex gap-4 h-[calc(100vh-80px)]">
        <div className="w-96 flex-none flex flex-col gap-4 overflow-y-auto">
          <TaskForm workspaces={allWorkspaces} onCreated={mutate} />
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
        <div className="flex-1 min-h-0">
          <LogViewer taskId={selectedId} initialLog={selectedTask?.log ?? ''} />
        </div>
      </div>

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Delete task?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {pendingDeleteTask?.status === 'running'
                ? `Task "${pendingDeleteTask?.issueKey}" is currently running. Deleting it will kill the Claude process immediately.`
                : `Task "${pendingDeleteTask?.issueKey}" will be permanently deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-700 hover:bg-red-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

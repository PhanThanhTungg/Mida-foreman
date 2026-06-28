'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Task } from '@foreman/types';
import { LogViewer } from '@/components/tasks/log-viewer';
import { TaskProgressGraph } from '@/components/tasks/task-progress-graph';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  task: Task | null;
}

type Tab = 'terminal' | 'progress';

export function TaskDetailTabs({ task }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('terminal');

  return (
    <div className="h-full min-h-0 flex flex-col gap-3">
      <div className="flex flex-none items-center gap-1 border-b border-slate-800">
        <TabButton active={activeTab === 'terminal'} onClick={() => setActiveTab('terminal')}>
          Terminal
        </TabButton>
        <TabButton active={activeTab === 'progress'} onClick={() => setActiveTab('progress')}>
          Progress
        </TabButton>
      </div>
      <div className="min-h-0 flex-1">
        {activeTab === 'terminal' ? (
          <LogViewer taskId={task?.id ?? null} initialLog={task?.log ?? ''} />
        ) : (
          <TaskProgressGraph task={task} />
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        'h-9 rounded-none border-b-2 border-transparent px-3 text-xs text-slate-400 hover:bg-slate-900 hover:text-slate-100',
        active && 'border-blue-500 text-slate-100',
      )}
    >
      {children}
    </Button>
  );
}

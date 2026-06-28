'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { CirclePlus, SquareTerminal } from 'lucide-react';
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
    <div className="flex h-full min-h-0 flex-col bg-black">
      <div className="flex h-[46px] flex-none items-center gap-1 border-b border-[#20262e] bg-[#10151c] px-5">
        <TabButton active={activeTab === 'terminal'} icon={<SquareTerminal className="size-3.5" />} onClick={() => setActiveTab('terminal')}>
          Terminal
        </TabButton>
        <TabButton active={activeTab === 'progress'} icon={<CirclePlus className="size-3.5" />} onClick={() => setActiveTab('progress')}>
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

function TabButton({ active, icon, onClick, children }: { active: boolean; icon: ReactNode; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        'h-full rounded-none border-b-2 border-transparent bg-transparent px-3 text-sm font-medium text-slate-400 hover:bg-transparent hover:text-slate-100',
        active && 'border-[#ff6b57] text-slate-100',
      )}
    >
      {icon}
      {children}
    </Button>
  );
}

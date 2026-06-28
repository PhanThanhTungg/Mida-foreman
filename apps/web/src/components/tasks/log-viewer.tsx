'use client';
import { useEffect, useRef } from 'react';
import { useTaskLog } from '@/hooks/use-task-log';

interface Props { taskId: string | null; initialLog: string; }

export function LogViewer({ taskId, initialLog }: Props) {
  const { lines } = useTaskLog(taskId, initialLog);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  if (!taskId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        Select a task to view its log
      </div>
    );
  }

  return (
    <div className="h-full bg-[#0d1117] rounded-lg p-4 overflow-y-auto font-mono text-sm">
      {lines.length === 0 ? (
        <span className="text-slate-600">No log output yet…</span>
      ) : (
        lines.map((line, i) => (
          <div key={i} className={line.startsWith('---') ? 'text-slate-500 my-2' : 'text-[#c9d1d9]'}>
            {line}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}

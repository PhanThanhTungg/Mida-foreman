'use client';
import type { Task, TaskStatus, AgentType } from '@foreman/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<TaskStatus, string> = {
  queued: 'bg-slate-600 text-slate-100',
  running: 'bg-blue-600 text-white',
  done: 'bg-green-700 text-white',
  failed: 'bg-red-700 text-white',
};

const AGENT_COLORS: Record<AgentType, string> = {
  feature: 'bg-purple-700 text-white',
  bugfix: 'bg-red-700 text-white',
  support: 'bg-teal-700 text-white',
  improve: 'bg-amber-700 text-white',
};

interface Props { tasks: Task[]; selectedId: string | null; onSelect: (id: string) => void; }

export function TaskList({ tasks, selectedId, onSelect }: Props) {
  if (tasks.length === 0) return <p className="text-sm text-slate-500 p-4">No tasks yet.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-slate-800">
          <TableHead className="text-slate-400 text-xs">Issue</TableHead>
          <TableHead className="text-slate-400 text-xs">Title</TableHead>
          <TableHead className="text-slate-400 text-xs">Agent</TableHead>
          <TableHead className="text-slate-400 text-xs">Status</TableHead>
          <TableHead className="text-slate-400 text-xs">Round</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((t) => (
          <TableRow
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={cn('cursor-pointer border-slate-800 hover:bg-slate-900', selectedId === t.id && 'bg-slate-900')}
          >
            <TableCell className="text-xs font-mono">{t.issueKey}</TableCell>
            <TableCell className="text-xs max-w-[200px] truncate">{t.title}</TableCell>
            <TableCell><Badge className={cn('text-xs', AGENT_COLORS[t.agentType as AgentType])}>{t.agentType}</Badge></TableCell>
            <TableCell><Badge className={cn('text-xs', STATUS_COLORS[t.status as TaskStatus])}>{t.status}</Badge></TableCell>
            <TableCell className="text-xs text-slate-400">{t.round}/{t.maxRounds}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

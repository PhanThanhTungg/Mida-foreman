'use client';
import { RefreshCcw, Trash2 } from 'lucide-react';
import type { Task, TaskStatus, AgentType } from '@foreman/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<TaskStatus, string> = {
  queued: 'border-slate-700 bg-slate-900/80 text-slate-300',
  running: 'border-[#1f6feb]/50 bg-[#0d2a4c] text-[#79c0ff]',
  done: 'border-emerald-500/40 bg-emerald-950/70 text-emerald-300',
  failed: 'border-red-500/40 bg-red-950/70 text-red-300',
};

const AGENT_COLORS: Record<AgentType, string> = {
  feature: 'border-violet-500/40 bg-violet-950/80 text-violet-300',
  bugfix: 'border-red-500/40 bg-red-950/70 text-red-300',
  support: 'border-teal-500/40 bg-teal-950/70 text-teal-300',
  improve: 'border-amber-500/40 bg-amber-950/70 text-amber-300',
};

interface Props { tasks: Task[]; selectedId: string | null; onSelect: (id: string) => void; onRetry: (id: string) => void; retryingId: string | null; onDelete: (id: string) => void; deletingId: string | null; }

export function TaskList({ tasks, selectedId, onSelect, onRetry, retryingId, onDelete, deletingId }: Props) {
  if (tasks.length === 0) {
    return <p className="border-t border-[#20262e] px-[18px] py-5 text-sm text-slate-600">No tasks yet.</p>;
  }

  return (
    <Table className="min-w-[455px]">
      <TableHeader>
        <TableRow className="border-[#20262e] hover:bg-transparent">
          <TableHead className="h-10 px-[18px] text-[10px] font-semibold uppercase tracking-normal text-slate-500">Issue</TableHead>
          <TableHead className="h-10 px-1 text-[10px] font-semibold uppercase tracking-normal text-slate-500">Title</TableHead>
          <TableHead className="h-10 px-1 text-[10px] font-semibold uppercase tracking-normal text-slate-500">Agent</TableHead>
          <TableHead className="h-10 px-1 text-[10px] font-semibold uppercase tracking-normal text-slate-500">Status</TableHead>
          <TableHead className="h-10 px-1 text-[10px] font-semibold uppercase tracking-normal text-slate-500">Round</TableHead>
          <TableHead className="h-10 px-1 text-[10px] font-semibold uppercase tracking-normal text-slate-500" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((t) => (
          <TableRow
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={cn(
              'group cursor-pointer border-[#111820] hover:bg-[#0b1118]',
              selectedId === t.id && 'bg-[#0d141d]',
            )}
          >
            <TableCell className="w-[78px] px-[18px] py-3 font-mono text-xs font-semibold text-[#58a6ff]">{t.issueKey}</TableCell>
            <TableCell className="max-w-[95px] truncate px-1 py-3 text-xs text-slate-100">{t.title}</TableCell>
            <TableCell className="px-1 py-3">
              <Badge className={cn('h-5 border px-2 py-0 text-[10px] font-medium', AGENT_COLORS[t.agentType as AgentType])}>{t.agentType}</Badge>
            </TableCell>
            <TableCell className="px-1 py-3">
              <Badge className={cn('h-5 border px-2 py-0 text-[10px] font-medium', STATUS_COLORS[t.status as TaskStatus])}>{t.status}</Badge>
            </TableCell>
            <TableCell className="px-1 py-3 text-xs text-slate-400">{t.round}/{t.maxRounds}</TableCell>
            <TableCell className="px-2 py-3">
              <div className="flex gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                <Button
                  size="sm"
                  variant="outline"
                  title="Retry task"
                  disabled={t.status === 'running' || t.status === 'queued' || retryingId === t.id}
                  onClick={(e) => { e.stopPropagation(); onRetry(t.id); }}
                  className="size-6 rounded border-[#27313d] bg-[#080d13] p-0 text-slate-400 hover:bg-[#121a24] hover:text-slate-100"
                >
                  <RefreshCcw className={cn('size-3', retryingId === t.id && 'animate-spin')} />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Delete task"
                  disabled={deletingId === t.id}
                  onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                  className="size-6 rounded border-red-950 bg-[#080d13] p-0 text-red-400 hover:bg-red-950 hover:text-red-300"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

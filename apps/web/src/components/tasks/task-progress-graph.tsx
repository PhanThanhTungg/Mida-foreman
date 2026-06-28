'use client';

import { Check, Circle, Clock, RefreshCcw, X } from 'lucide-react';
import type { Task, TaskProgressEvent, TaskProgressPhase, TaskProgressStatus } from '@foreman/types';
import { useTaskProgress } from '@/hooks/use-task-progress';
import { cn } from '@/lib/utils';

const PHASES: Array<{ phase: TaskProgressPhase; label: string }> = [
  { phase: 'jira_fetch', label: 'Jira' },
  { phase: 'queued', label: 'Queue' },
  { phase: 'preflight', label: 'Preflight' },
  { phase: 'understand', label: 'Understand' },
  { phase: 'plan', label: 'Plan' },
  { phase: 'code', label: 'Code' },
  { phase: 'verify', label: 'Verify' },
  { phase: 'pr', label: 'PR' },
  { phase: 'complete', label: 'Complete' },
];

const STATUS_STYLES: Record<TaskProgressStatus | 'pending', string> = {
  pending: 'border-slate-800 bg-slate-950 text-slate-600',
  started: 'border-blue-500/60 bg-blue-950/60 text-blue-200',
  completed: 'border-green-600/50 bg-green-950/50 text-green-200',
  failed: 'border-red-600/60 bg-red-950/60 text-red-200',
  skipped: 'border-slate-700 bg-slate-900 text-slate-400',
  looped: 'border-amber-500/60 bg-amber-950/60 text-amber-200',
};

interface Props {
  task: Task | null;
}

export function TaskProgressGraph({ task }: Props) {
  const { events, isLoading } = useTaskProgress(task?.id ?? null);

  if (!task) {
    return (
      <div className="h-full rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center text-sm text-slate-600">
        Select a task to view its progress
      </div>
    );
  }

  if (isLoading && events.length === 0) {
    return (
      <div className="h-full rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center text-sm text-slate-500">
        Loading progress...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="h-full rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center text-sm text-slate-600">
        No progress events yet
      </div>
    );
  }

  const rounds = groupByRound(events);

  return (
    <div className="h-full rounded-lg border border-slate-800 bg-slate-950 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-100 truncate">{task.issueKey}</div>
          <div className="text-xs text-slate-500 truncate">{task.title}</div>
        </div>
        <div className="text-xs text-slate-500 flex-none">
          Round {task.round}/{task.maxRounds}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4 space-y-5">
        {rounds.map(({ round, roundEvents }) => (
          <RoundLane key={round} round={round} events={roundEvents} />
        ))}
      </div>
    </div>
  );
}

function RoundLane({ round, events }: { round: number; events: TaskProgressEvent[] }) {
  const loopEvents = events.filter((event) => event.status === 'looped');
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="text-xs font-semibold uppercase tracking-normal text-slate-400">
          {round === 0 ? 'Intake' : `Round ${round}`}
        </div>
        <div className="h-px flex-1 bg-slate-800" />
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[900px] grid-cols-9 gap-2">
          {PHASES.map(({ phase, label }) => {
            const event = latestForPhase(events, phase);
            return <PhaseNode key={phase} event={event} label={label} />;
          })}
        </div>
      </div>
      {loopEvents.map((event) => (
        <div
          key={event.id}
          className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-100"
        >
          <RefreshCcw className="size-3.5 flex-none" />
          <span className="font-medium">Loop</span>
          <span className="text-amber-200/80">{event.message || `Round ${round} queued again`}</span>
        </div>
      ))}
    </section>
  );
}

function PhaseNode({ event, label }: { event?: TaskProgressEvent; label: string }) {
  const status = event?.status ?? 'pending';
  return (
    <div
      className={cn(
        'h-24 rounded-md border px-2.5 py-2 flex flex-col justify-between transition-colors',
        STATUS_STYLES[status],
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium truncate">{label}</span>
        <StatusIcon status={status} />
      </div>
      <div className="space-y-1">
        <div className="text-[11px] capitalize text-current/80">{status}</div>
        {event?.message ? (
          <div className="line-clamp-2 text-[11px] leading-4 text-current/70">{event.message}</div>
        ) : null}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: TaskProgressStatus | 'pending' }) {
  if (status === 'completed') return <Check className="size-3.5 flex-none" />;
  if (status === 'failed') return <X className="size-3.5 flex-none" />;
  if (status === 'started') return <Clock className="size-3.5 flex-none" />;
  if (status === 'looped') return <RefreshCcw className="size-3.5 flex-none" />;
  return <Circle className="size-3.5 flex-none" />;
}

function groupByRound(events: TaskProgressEvent[]) {
  const grouped = new Map<number, TaskProgressEvent[]>();
  for (const event of events) {
    grouped.set(event.round, [...(grouped.get(event.round) ?? []), event]);
  }
  return Array.from(grouped.entries())
    .sort(([a], [b]) => a - b)
    .map(([round, roundEvents]) => ({ round, roundEvents }));
}

function latestForPhase(events: TaskProgressEvent[], phase: TaskProgressPhase): TaskProgressEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].phase === phase) return events[index];
  }
  return undefined;
}

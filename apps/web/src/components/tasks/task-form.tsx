'use client';
import { useState } from 'react';
import { Info, Plus } from 'lucide-react';
import type { Workspace, AgentType } from '@foreman/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';

interface Props { workspaces: Workspace[]; onCreated: () => void; }

const AGENT_TYPES: AgentType[] = ['feature', 'bugfix', 'support', 'improve'];
const controlClass = 'h-[31px] rounded-md border-[#2b3542] bg-[#080d13] px-3 text-sm text-slate-100 shadow-none placeholder:text-slate-500 focus-visible:ring-1 focus-visible:ring-[#58a6ff] focus-visible:ring-offset-0';
const labelClass = 'text-[11px] font-medium uppercase leading-none tracking-normal text-slate-400';

export function TaskForm({ workspaces, onCreated }: Props) {
  const [issueKey, setIssueKey] = useState('');
  const [title, setTitle] = useState('');
  const [repoId, setRepoId] = useState('');
  const [agentType, setAgentType] = useState<AgentType>('bugfix');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!issueKey || !title || !repoId) { setError('All fields required'); return; }
    setLoading(true);
    try {
      await apiClient.tasks.create({ issueKey, title, repoId, agentType });
      setIssueKey(''); setTitle('');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-[18px] pb-5 pt-[18px]">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold leading-none text-slate-100">
        <Info className="size-3.5 text-[#58a6ff]" />
        New Task
      </h2>
      <div className="space-y-2">
        <Label htmlFor="issueKey" className={labelClass}>Issue Key</Label>
        <Input id="issueKey" value={issueKey} onChange={(e) => setIssueKey(e.target.value)} placeholder="MAH-42" className={controlClass} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="title" className={labelClass}>Title</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fix login redirect" className={controlClass} />
      </div>
      <div className="space-y-2">
        <Label className={labelClass}>Workspace</Label>
        <Select value={repoId} onValueChange={setRepoId}>
          <SelectTrigger className={controlClass}><SelectValue placeholder="Select workspace" /></SelectTrigger>
          <SelectContent className="border-[#2b3542] bg-[#080d13] text-slate-100">
            {workspaces.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className={labelClass}>Agent Type</Label>
        <Select value={agentType} onValueChange={(v) => setAgentType(v as AgentType)}>
          <SelectTrigger className={controlClass}><SelectValue placeholder="bugfix" /></SelectTrigger>
          <SelectContent className="border-[#2b3542] bg-[#080d13] text-slate-100">
            {AGENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <Button
        type="submit"
        disabled={loading}
        size="sm"
        className="h-[35px] w-full rounded-md bg-[#fff] text-[13px] font-medium text-black hover:bg-[#000] hover:text-white hover:border-2 "
      >
        <Plus className="size-4" />
        {loading ? 'Creating…' : 'Create Task'}
      </Button>
    </form>
  );
}

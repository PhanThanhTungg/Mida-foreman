'use client';
import { useState } from 'react';
import type { Workspace, AgentType } from '@foreman/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';

interface Props { workspaces: Workspace[]; onCreated: () => void; }

const AGENT_TYPES: AgentType[] = ['feature', 'bugfix', 'support', 'improve'];

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
    <form onSubmit={handleSubmit} className="space-y-3 p-4 border border-slate-800 rounded-lg">
      <h2 className="text-sm font-semibold text-slate-300">New Task</h2>
      <div className="space-y-1">
        <Label htmlFor="issueKey" className="text-xs text-slate-400">Issue Key</Label>
        <Input id="issueKey" value={issueKey} onChange={(e) => setIssueKey(e.target.value)} placeholder="MAH-42" className="h-8 text-sm bg-slate-900 border-slate-700" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="title" className="text-xs text-slate-400">Title</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fix login redirect" className="h-8 text-sm bg-slate-900 border-slate-700" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Workspace</Label>
        <Select value={repoId} onValueChange={setRepoId}>
          <SelectTrigger className="h-8 text-sm bg-slate-900 border-slate-700"><SelectValue placeholder="Select workspace" /></SelectTrigger>
          <SelectContent>{workspaces.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Agent Type</Label>
        <Select value={agentType} onValueChange={(v) => setAgentType(v as AgentType)}>
          <SelectTrigger className="h-8 text-sm bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>{AGENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <Button type="submit" disabled={loading} size="sm" className="w-full">
        {loading ? 'Creating…' : 'Create Task'}
      </Button>
    </form>
  );
}

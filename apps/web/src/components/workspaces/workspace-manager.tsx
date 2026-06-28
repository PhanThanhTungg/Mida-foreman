'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  CircleDashed,
  FolderGit2,
  FolderOpen,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { Workspace, WorkspaceVerifyResult } from '@foreman/types';
import { useWorkspaces } from '@/hooks/use-workspaces';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface WorkspaceFormData {
  name: string;
  path: string;
  description: string;
}

const emptyForm = (): WorkspaceFormData => ({ name: '', path: '', description: '' });

const panelClass = 'border border-[#1b222b] bg-[#030303] shadow-[0_18px_60px_rgba(0,0,0,0.45)]';
const labelClass = 'text-[11px] font-semibold uppercase leading-none tracking-normal text-slate-500';
const inputClass =
  'h-10 rounded-md border-[#242d38] bg-black px-3 text-sm text-slate-100 shadow-none placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-[#58a6ff] focus-visible:ring-offset-0';
const ghostButtonClass =
  'h-8 rounded-md border border-[#1b222b] bg-black px-2.5 text-xs font-medium text-slate-300 hover:bg-[#080d13] hover:text-slate-50';

export function WorkspaceManager({ initialWorkspaces }: { initialWorkspaces: Workspace[] }) {
  const { workspaces, mutate } = useWorkspaces();
  const allWorkspaces = workspaces.length > 0 ? workspaces : initialWorkspaces;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Workspace | null>(null);
  const [form, setForm] = useState<WorkspaceFormData>(emptyForm());
  const [verifyResults, setVerifyResults] = useState<Record<string, WorkspaceVerifyResult>>({});
  const [verifying, setVerifying] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(workspace: Workspace) {
    setEditing(workspace);
    setForm({ name: workspace.name, path: workspace.path, description: workspace.description });
    setOpen(true);
  }

  async function handleSave() {
    if (editing) {
      await apiClient.workspaces.update(editing.id, form);
    } else {
      await apiClient.workspaces.create(form);
    }
    setOpen(false);
    mutate();
  }

  async function handleDelete(id: string) {
    await apiClient.workspaces.delete(id);
    mutate();
  }

  async function handleVerify(id: string) {
    setVerifying(id);
    try {
      const result = await apiClient.workspaces.verify(id);
      setVerifyResults((prev) => ({ ...prev, [id]: result }));
    } finally {
      setVerifying(null);
    }
  }

  const verifiedCount = allWorkspaces.filter((workspace) => verifyResults[workspace.id]?.pathExists).length;
  const missingCount = allWorkspaces.filter((workspace) => verifyResults[workspace.id] && !verifyResults[workspace.id].pathExists).length;
  const totalSubRepos = Object.values(verifyResults).reduce((total, result) => total + result.subRepoCount, 0);

  const field = (key: keyof WorkspaceFormData, label: string, placeholder: string) => (
    <div className="space-y-2">
      <Label className={labelClass}>{label}</Label>
      <Input
        value={form[key]}
        onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  );

  const renderStatus = (result: WorkspaceVerifyResult | undefined) => {
    if (!result) {
      return (
        <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#243044] bg-black px-2.5 text-xs font-medium text-slate-500">
          <CircleDashed className="size-3.5" />
          Not verified
        </span>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium',
            result.pathExists
              ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
              : 'border-red-500/30 bg-red-950/30 text-red-300',
          )}
        >
          {result.pathExists ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
          {result.pathExists ? 'Path OK' : 'Path missing'}
        </span>
        {result.pathExists && (
          <span className="inline-flex h-7 items-center rounded-md border border-[#243044] bg-black px-2.5 font-mono text-xs text-slate-400">
            {result.subRepoCount} sub-repo{result.subRepoCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    );
  };

  const renderActions = (workspace: Workspace, className?: string) => (
    <div className={cn('flex justify-end gap-2', className)}>
      <Button
        variant="ghost"
        size="sm"
        className={ghostButtonClass}
        onClick={() => handleVerify(workspace.id)}
        disabled={verifying === workspace.id}
      >
        <RefreshCw className={cn('size-3.5', verifying === workspace.id && 'animate-spin')} />
        Verify
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={ghostButtonClass}
        onClick={() => openEdit(workspace)}
        aria-label={`Edit ${workspace.name}`}
      >
        <Pencil className="size-3.5" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-md border border-red-500/20 bg-black px-2.5 text-xs font-medium text-red-300 hover:bg-red-950/30 hover:text-red-200"
            aria-label={`Delete ${workspace.name}`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="border-[#1b222b] bg-[#030303] text-slate-100 shadow-[0_22px_80px_rgba(0,0,0,0.75)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base text-slate-50">Delete {workspace.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-6 text-slate-500">
              This removes the workspace and related task records from Foreman. Local files are not touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 rounded-md border-[#243044] bg-black px-3 text-xs text-slate-300 hover:bg-[#080d13] hover:text-slate-50">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete(workspace.id)}
              className="h-8 rounded-md border border-red-500/40 bg-red-950/50 px-3 text-xs font-semibold text-red-100 hover:bg-red-900/70"
            >
              Delete workspace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-46px)] bg-black px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-[#141a22] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md border border-[#243044] bg-[#050505] text-[#58a6ff]">
              <FolderGit2 className="size-4" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold leading-tight text-slate-50">Workspaces</h1>
              <p className="mt-1 text-sm text-slate-500">Repository roots and local project directories.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center gap-2 rounded-md border border-[#243044] bg-[#050505] px-3 text-xs font-medium text-slate-300">
              <span className="font-mono text-[#58a6ff]">{allWorkspaces.length}</span>
              configured roots
            </span>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  onClick={openCreate}
                  className="h-8 rounded-md border border-white bg-white px-3 text-xs font-semibold text-black hover:bg-black hover:text-white"
                >
                  <Plus className="size-3.5" />
                  Add workspace
                </Button>
              </DialogTrigger>
              <DialogContent className="border-[#1b222b] bg-[#030303] text-slate-100 shadow-[0_22px_80px_rgba(0,0,0,0.75)] sm:rounded-lg">
                <DialogHeader>
                  <DialogTitle className="text-base text-slate-50">{editing ? 'Edit workspace' : 'Add workspace'}</DialogTitle>
                  <DialogDescription className="text-sm text-slate-500">
                    Register a local repository root for Foreman task execution.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {field('name', 'Name', 'my-projects')}
                  {field('path', 'Path', '/home/user/projects')}
                  {field('description', 'Description', 'Optional description')}
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleSave}
                    size="sm"
                    className="h-8 rounded-md border border-white bg-white px-3 text-xs font-semibold text-black hover:bg-black hover:text-white"
                  >
                    <CheckCircle2 className="size-3.5" />
                    Save workspace
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className={cn(panelClass, 'rounded-lg p-3')}>
            <div className="space-y-1 px-2 pb-3 pt-1">
              <p className={labelClass}>Workspace settings</p>
            </div>
            <div className="space-y-2">
              <div className="rounded-md border border-[#1b222b] bg-black p-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Configured roots</span>
                  <FolderOpen className="size-3.5" />
                </div>
                <p className="mt-2 font-mono text-2xl font-semibold leading-none text-slate-50">{allWorkspaces.length}</p>
              </div>
              <div className="rounded-md border border-[#1b222b] bg-black p-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Verified paths</span>
                  <ShieldCheck className="size-3.5" />
                </div>
                <p className="mt-2 font-mono text-2xl font-semibold leading-none text-emerald-300">{verifiedCount}</p>
              </div>
              <div className="rounded-md border border-[#1b222b] bg-black p-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Sub-repos found</span>
                  <Settings2 className="size-3.5" />
                </div>
                <p className="mt-2 font-mono text-2xl font-semibold leading-none text-[#58a6ff]">{totalSubRepos}</p>
              </div>
            </div>
            <div
              className={cn(
                'mt-4 rounded-md border p-3 text-xs leading-5',
                missingCount > 0
                  ? 'border-red-500/30 bg-red-950/20 text-red-200'
                  : 'border-[#1b222b] bg-black text-slate-500',
              )}
            >
              {missingCount > 0
                ? `${missingCount} verified path${missingCount !== 1 ? 's are' : ' is'} missing on disk.`
                : 'Verify paths after changing local directories.'}
            </div>
          </aside>

          <section className={cn(panelClass, 'overflow-hidden rounded-lg')}>
            <div className="flex flex-col gap-3 border-b border-[#141a22] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-100">Repository roots</h2>
                <p className="mt-1 text-xs text-slate-500">Each workspace points to a local folder that can contain one or more Git repositories.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => mutate()} className={ghostButtonClass}>
                <RefreshCw className="size-3.5" />
                Refresh
              </Button>
            </div>

            <div className="divide-y divide-[#111820] sm:hidden">
              {allWorkspaces.map((workspace) => {
                const result = verifyResults[workspace.id];
                return (
                  <article key={workspace.id} className="space-y-4 px-4 py-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[#1b222b] bg-black text-slate-500">
                        <FolderGit2 className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold text-slate-100">{workspace.name}</h3>
                        <p className="mt-1 truncate text-xs text-slate-600">{workspace.description || 'No description'}</p>
                      </div>
                    </div>
                    <code className="block max-w-full truncate rounded-md border border-[#1b222b] bg-black px-2.5 py-1.5 font-mono text-xs text-slate-400">
                      {workspace.path}
                    </code>
                    <div className="flex flex-col gap-3">
                      {renderStatus(result)}
                      {renderActions(workspace, 'justify-start')}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="hidden sm:block">
              <Table>
              <TableHeader>
                <TableRow className="border-[#141a22] hover:bg-transparent">
                  <TableHead className="h-10 px-4 text-[11px] font-semibold uppercase tracking-normal text-slate-500 sm:px-5">Name</TableHead>
                  <TableHead className="h-10 px-4 text-[11px] font-semibold uppercase tracking-normal text-slate-500">Path</TableHead>
                  <TableHead className="h-10 px-4 text-[11px] font-semibold uppercase tracking-normal text-slate-500">Status</TableHead>
                  <TableHead className="h-10 px-4 text-right text-[11px] font-semibold uppercase tracking-normal text-slate-500 sm:px-5">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allWorkspaces.length === 0 && (
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableCell colSpan={4} className="px-5 py-12">
                      <div className="mx-auto flex max-w-sm flex-col items-center text-center">
                        <span className="grid size-10 place-items-center rounded-md border border-[#243044] bg-black text-[#58a6ff]">
                          <FolderGit2 className="size-4" />
                        </span>
                        <h3 className="mt-4 text-sm font-semibold text-slate-100">No workspaces yet</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          Add a local project directory to let Foreman discover repositories and run tasks.
                        </p>
                        <Button
                          size="sm"
                          onClick={openCreate}
                          className="mt-4 h-8 rounded-md border border-white bg-white px-3 text-xs font-semibold text-black hover:bg-black hover:text-white"
                        >
                          <Plus className="size-3.5" />
                          Add workspace
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {allWorkspaces.map((workspace) => {
                  const result = verifyResults[workspace.id];
                  return (
                    <TableRow key={workspace.id} className="border-[#111820] hover:bg-[#05080d]">
                      <TableCell className="px-4 py-4 sm:px-5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[#1b222b] bg-black text-slate-500">
                            <FolderGit2 className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-100">{workspace.name}</p>
                            <p className="mt-1 truncate text-xs text-slate-600">{workspace.description || 'No description'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[420px] px-4 py-4">
                        <code className="block truncate rounded-md border border-[#1b222b] bg-black px-2.5 py-1.5 font-mono text-xs text-slate-400">
                          {workspace.path}
                        </code>
                      </TableCell>
                      <TableCell className="px-4 py-4">
                        {renderStatus(result)}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-right sm:px-5">
                        {renderActions(workspace)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              </Table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

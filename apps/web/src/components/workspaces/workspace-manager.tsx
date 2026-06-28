'use client';
import { useState } from 'react';
import type { Workspace, WorkspaceVerifyResult } from '@foreman/types';
import { useWorkspaces } from '@/hooks/use-workspaces';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface WorkspaceFormData { name: string; path: string; description: string; }
const emptyForm = (): WorkspaceFormData => ({ name: '', path: '', description: '' });

export function WorkspaceManager({ initialWorkspaces }: { initialWorkspaces: Workspace[] }) {
  const { workspaces, mutate } = useWorkspaces();
  const allWorkspaces = workspaces.length > 0 ? workspaces : initialWorkspaces;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Workspace | null>(null);
  const [form, setForm] = useState<WorkspaceFormData>(emptyForm());
  const [verifyResults, setVerifyResults] = useState<Record<string, WorkspaceVerifyResult>>({});
  const [verifying, setVerifying] = useState<string | null>(null);

  function openCreate() { setEditing(null); setForm(emptyForm()); setOpen(true); }
  function openEdit(workspace: Workspace) { setEditing(workspace); setForm({ name: workspace.name, path: workspace.path, description: workspace.description }); setOpen(true); }

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

  const field = (key: keyof WorkspaceFormData, label: string, placeholder: string) => (
    <div className="space-y-1">
      <Label className="text-xs text-slate-400">{label}</Label>
      <Input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="h-8 text-sm bg-slate-900 border-slate-700" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold">Workspaces</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" onClick={openCreate}>Add Workspace</Button></DialogTrigger>
          <DialogContent className="bg-slate-950 border-slate-800">
            <DialogHeader><DialogTitle>{editing ? 'Edit Workspace' : 'Add Workspace'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {field('name', 'Name', 'my-projects')}
              {field('path', 'Path', '/home/user/projects')}
              {field('description', 'Description', 'Optional description')}
              <Button onClick={handleSave} className="w-full" size="sm">Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-slate-800">
            <TableHead className="text-xs text-slate-400">Name</TableHead>
            <TableHead className="text-xs text-slate-400">Path</TableHead>
            <TableHead className="text-xs text-slate-400">Verify</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {allWorkspaces.map((w) => {
            const vr = verifyResults[w.id];
            return (
              <TableRow key={w.id} className="border-slate-800">
                <TableCell className="text-sm font-medium">{w.name}</TableCell>
                <TableCell className="text-xs font-mono text-slate-400">{w.path}</TableCell>
                <TableCell>
                  {vr ? (
                    <div className="flex gap-2 text-xs">
                      <span className={cn(vr.pathExists ? 'text-green-400' : 'text-red-400')}>
                        {vr.pathExists ? 'path ✓' : 'path ✗'}
                      </span>
                      {vr.pathExists && (
                        <span className="text-slate-400">{vr.subRepoCount} sub-repo{vr.subRepoCount !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => handleVerify(w.id)} disabled={verifying === w.id}>
                      {verifying === w.id ? '…' : 'Verify'}
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" className="h-6 text-xs mr-1" onClick={() => openEdit(w)}>Edit</Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="h-6 text-xs text-red-400 hover:text-red-300">Delete</Button></AlertDialogTrigger>
                    <AlertDialogContent className="bg-slate-950 border-slate-800">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {w.name}?</AlertDialogTitle>
                        <AlertDialogDescription>This will remove the workspace from Foreman. Tasks referencing it will not be deleted.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(w.id)} className="bg-red-700 hover:bg-red-600">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

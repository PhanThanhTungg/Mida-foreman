'use client';
import { useState } from 'react';
import type { Repo, RepoVerifyResult } from '@foreman/types';
import { useRepos } from '@/hooks/use-repos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface RepoFormData { name: string; path: string; githubRepo: string; description: string; }
const emptyForm = (): RepoFormData => ({ name: '', path: '', githubRepo: '', description: '' });

export function RepoManager({ initialRepos }: { initialRepos: Repo[] }) {
  const { repos, mutate } = useRepos();
  const allRepos = repos.length > 0 ? repos : initialRepos;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Repo | null>(null);
  const [form, setForm] = useState<RepoFormData>(emptyForm());
  const [verifyResults, setVerifyResults] = useState<Record<string, RepoVerifyResult>>({});
  const [verifying, setVerifying] = useState<string | null>(null);

  function openCreate() { setEditing(null); setForm(emptyForm()); setOpen(true); }
  function openEdit(repo: Repo) { setEditing(repo); setForm({ name: repo.name, path: repo.path, githubRepo: repo.githubRepo, description: repo.description }); setOpen(true); }

  async function handleSave() {
    if (editing) {
      await apiClient.repos.update(editing.id, form);
    } else {
      await apiClient.repos.create(form);
    }
    setOpen(false);
    mutate();
  }

  async function handleDelete(id: string) {
    await apiClient.repos.delete(id);
    mutate();
  }

  async function handleVerify(id: string) {
    setVerifying(id);
    try {
      const result = await apiClient.repos.verify(id);
      setVerifyResults((prev) => ({ ...prev, [id]: result }));
    } finally {
      setVerifying(null);
    }
  }

  const field = (key: keyof RepoFormData, label: string, placeholder: string) => (
    <div className="space-y-1">
      <Label className="text-xs text-slate-400">{label}</Label>
      <Input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="h-8 text-sm bg-slate-900 border-slate-700" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold">Repositories</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" onClick={openCreate}>Add Repo</Button></DialogTrigger>
          <DialogContent className="bg-slate-950 border-slate-800">
            <DialogHeader><DialogTitle>{editing ? 'Edit Repo' : 'Add Repo'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {field('name', 'Name', 'my-app')}
              {field('path', 'Path', '/home/user/repos/my-app')}
              {field('githubRepo', 'GitHub Repo', 'org/my-app')}
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
            <TableHead className="text-xs text-slate-400">GitHub</TableHead>
            <TableHead className="text-xs text-slate-400">Verify</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {allRepos.map((r) => {
            const vr = verifyResults[r.id];
            return (
              <TableRow key={r.id} className="border-slate-800">
                <TableCell className="text-sm font-medium">{r.name}</TableCell>
                <TableCell className="text-xs font-mono text-slate-400">{r.path}</TableCell>
                <TableCell className="text-xs text-slate-400">{r.githubRepo}</TableCell>
                <TableCell>
                  {vr ? (
                    <div className="flex gap-1 text-xs">
                      <span className={cn(vr.pathExists ? 'text-green-400' : 'text-red-400')}>path</span>
                      <span className={cn(vr.isGitRepo ? 'text-green-400' : 'text-red-400')}>git</span>
                      <span className={cn(vr.canGitStatus ? 'text-green-400' : 'text-red-400')}>status</span>
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => handleVerify(r.id)} disabled={verifying === r.id}>
                      {verifying === r.id ? '…' : 'Verify'}
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" className="h-6 text-xs mr-1" onClick={() => openEdit(r)}>Edit</Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="h-6 text-xs text-red-400 hover:text-red-300">Delete</Button></AlertDialogTrigger>
                    <AlertDialogContent className="bg-slate-950 border-slate-800">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {r.name}?</AlertDialogTitle>
                        <AlertDialogDescription>This will remove the repo from Foreman. Tasks referencing it will not be deleted.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(r.id)} className="bg-red-700 hover:bg-red-600">Delete</AlertDialogAction>
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

# Phase 6: Next.js Frontend — Foreman

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js 14 App Router frontend with Tasks, Repos, and Settings pages, dark theme, shadcn/ui components, SWR polling, and WebSocket log streaming.

**Architecture:** Next.js App Router under `apps/web`. Page-level Server Components fetch initial data; all interactive parts are `'use client'` components. API calls go to the NestJS backend via a typed `apiClient` wrapper. WebSocket connection via `socket.io-client`. `useTasks` and `useRepos` use SWR polling every 3s. `useTaskLog` connects WebSocket on mount, disconnects on unmount.

**Tech Stack:** Next.js 14+, TailwindCSS, shadcn/ui, SWR, socket.io-client, TypeScript strict

**Prerequisite:** Phase 1 (`@foreman/types` available), Phase 2–3 API running with `x-api-key` auth.

---

## File Structure

```
foreman/apps/web/
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── components.json             # shadcn/ui config
├── src/
│   ├── app/
│   │   ├── layout.tsx          # root layout: dark theme, NavigationMenu, fonts
│   │   ├── page.tsx            # redirect → /tasks
│   │   ├── tasks/
│   │   │   └── page.tsx        # Server Component: initial tasks fetch
│   │   ├── repos/
│   │   │   └── page.tsx        # Server Component: initial repos fetch
│   │   └── settings/
│   │       └── page.tsx        # Server Component: initial settings fetch
│   ├── components/
│   │   ├── navigation.tsx      # shadcn NavigationMenu — Tasks / Repos / Settings
│   │   ├── tasks/
│   │   │   ├── task-form.tsx   # 'use client' — create task form
│   │   │   ├── task-list.tsx   # 'use client' — shadcn Table + Badge, SWR 3s
│   │   │   └── log-viewer.tsx  # 'use client' — terminal panel, WebSocket
│   │   ├── repos/
│   │   │   └── repo-manager.tsx # 'use client' — table + Dialog add/edit + AlertDialog delete + verify badge
│   │   └── settings/
│   │       └── settings-form.tsx # 'use client' — credential inputs + status badges
│   ├── lib/
│   │   ├── api-client.ts       # typed fetch wrapper — all API calls
│   │   └── constants.ts        # API_URL, WS_URL
│   └── hooks/
│       ├── use-tasks.ts        # SWR 3s polling
│       ├── use-repos.ts        # SWR fetch
│       └── use-task-log.ts     # WebSocket subscription
```

---

### Task 1: Scaffold Next.js + TailwindCSS + shadcn/ui

**Files:**
- Create: `foreman/apps/web/package.json`
- Create: `foreman/apps/web/tsconfig.json`
- Create: `foreman/apps/web/next.config.js`
- Create: `foreman/apps/web/tailwind.config.ts`
- Create: `foreman/apps/web/postcss.config.js`
- Create: `foreman/apps/web/components.json`

**Interfaces:**
- Produces: `pnpm --filter @foreman/web dev` starts Next.js on port 3000

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@foreman/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@foreman/types": "workspace:*",
    "next": "14.2.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "swr": "^2.2.5",
    "socket.io-client": "^4.7.5",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.379.0",
    "tailwind-merge": "^2.3.0",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-alert-dialog": "^1.0.5",
    "@radix-ui/react-navigation-menu": "^1.1.4",
    "@radix-ui/react-badge": "^1.0.0",
    "@radix-ui/react-label": "^2.0.2",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-table": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.7",
    "@types/react": "^18.3.2",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "eslint": "^8.57.0",
    "eslint-config-next": "14.2.3",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@foreman/types": ["../../packages/types/src"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create next.config.js**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@foreman/types'],
};
module.exports = nextConfig;
```

- [ ] **Step 4: Create tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss';
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { mono: ['var(--font-mono)', 'monospace'] },
      colors: {
        terminal: { bg: '#0d1117', text: '#c9d1d9' },
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 5: Create postcss.config.js**

```javascript
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 6: Create components.json (shadcn/ui config)**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": { "config": "tailwind.config.ts", "css": "src/app/globals.css", "baseColor": "slate", "cssVariables": true },
  "aliases": { "components": "@/components", "utils": "@/lib/utils" }
}
```

- [ ] **Step 7: Install and initialize shadcn/ui**

```bash
cd foreman
pnpm install
cd apps/web
# Install shadcn/ui components used in this project
npx shadcn-ui@latest add button input label select table badge dialog alert-dialog navigation-menu
```
Expected: components created under `src/components/ui/`

- [ ] **Step 8: Create src/lib/utils.ts (shadcn helper)**

```typescript
// foreman/apps/web/src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

- [ ] **Step 9: Commit**

```bash
cd foreman
git add apps/web/
git commit -m "chore(web): scaffold Next.js 14 with TailwindCSS and shadcn/ui"
```

---

### Task 2: Layout, Navigation, Constants, API Client

**Files:**
- Create: `foreman/apps/web/src/lib/constants.ts`
- Create: `foreman/apps/web/src/lib/api-client.ts`
- Create: `foreman/apps/web/src/app/globals.css`
- Create: `foreman/apps/web/src/app/layout.tsx`
- Create: `foreman/apps/web/src/app/page.tsx`
- Create: `foreman/apps/web/src/components/navigation.tsx`

**Interfaces:**
- Produces:
  - `apiClient.tasks.list(): Promise<Task[]>`
  - `apiClient.tasks.create(dto): Promise<Task>`
  - `apiClient.tasks.delete(id): Promise<void>`
  - `apiClient.tasks.get(id): Promise<Task>`
  - `apiClient.repos.list(): Promise<Repo[]>`
  - `apiClient.repos.create(dto): Promise<Repo>`
  - `apiClient.repos.update(id, dto): Promise<Repo>`
  - `apiClient.repos.delete(id): Promise<void>`
  - `apiClient.repos.verify(id): Promise<RepoVerifyResult>`
  - `apiClient.settings.list(): Promise<Setting[]>`
  - `apiClient.settings.upsert(settings): Promise<Setting[]>`

- [ ] **Step 1: Create constants.ts**

```typescript
// foreman/apps/web/src/lib/constants.ts
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';
export const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? '';
```

- [ ] **Step 2: Create api-client.ts**

```typescript
// foreman/apps/web/src/lib/api-client.ts
import type { Task, Repo, Setting, RepoVerifyResult, AgentType } from '@foreman/types';
import { API_URL, API_KEY } from './constants';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiClient = {
  tasks: {
    list: () => request<Task[]>('/tasks'),
    get: (id: string) => request<Task>(`/tasks/${id}`),
    create: (dto: { issueKey: string; title: string; repoId: string; agentType: AgentType; maxRounds?: number }) =>
      request<Task>('/tasks', { method: 'POST', body: JSON.stringify(dto) }),
    delete: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
  },
  repos: {
    list: () => request<Repo[]>('/repos'),
    create: (dto: { name: string; path: string; githubRepo: string; description?: string }) =>
      request<Repo>('/repos', { method: 'POST', body: JSON.stringify(dto) }),
    update: (id: string, dto: Partial<{ name: string; path: string; githubRepo: string; description: string; active: boolean }>) =>
      request<Repo>(`/repos/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
    delete: (id: string) => request<void>(`/repos/${id}`, { method: 'DELETE' }),
    verify: (id: string) => request<RepoVerifyResult>(`/repos/${id}/verify`, { method: 'POST' }),
  },
  settings: {
    list: () => request<Setting[]>('/settings'),
    upsert: (settings: Setting[]) =>
      request<Setting[]>('/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),
  },
};
```

- [ ] **Step 3: Create globals.css**

```css
/* foreman/apps/web/src/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}

html {
  @apply dark;
}

body {
  @apply bg-slate-950 text-slate-100;
}
```

- [ ] **Step 4: Create layout.tsx**

```tsx
// foreman/apps/web/src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import { Navigation } from '@/components/navigation';

export const metadata: Metadata = {
  title: 'Foreman',
  description: 'AI-powered Jira task automation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <header className="border-b border-slate-800 px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold text-slate-100">Foreman</span>
            <Navigation />
          </div>
        </header>
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Create page.tsx (root redirect)**

```tsx
// foreman/apps/web/src/app/page.tsx
import { redirect } from 'next/navigation';
export default function Home() { redirect('/tasks'); }
```

- [ ] **Step 6: Create navigation.tsx**

```tsx
// foreman/apps/web/src/components/navigation.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const links = [
  { href: '/tasks', label: 'Tasks' },
  { href: '/repos', label: 'Repos' },
  { href: '/settings', label: 'Settings' },
];

export function Navigation() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-4">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cn(
            'text-sm transition-colors hover:text-slate-100',
            pathname.startsWith(l.href) ? 'text-slate-100 font-medium' : 'text-slate-400',
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 7: Commit**

```bash
cd foreman
git add apps/web/src/
git commit -m "feat(web): add layout, navigation, API client, and constants"
```

---

### Task 3: Hooks — useTasks, useRepos, useTaskLog

**Files:**
- Create: `foreman/apps/web/src/hooks/use-tasks.ts`
- Create: `foreman/apps/web/src/hooks/use-repos.ts`
- Create: `foreman/apps/web/src/hooks/use-task-log.ts`

**Interfaces:**
- Produces:
  - `useTasks(): { tasks: Task[]; isLoading: boolean; mutate: () => void }` — SWR poll every 3s
  - `useRepos(): { repos: Repo[]; isLoading: boolean; mutate: () => void }` — SWR fetch
  - `useTaskLog(taskId: string | null, initialLog: string): { lines: string[] }` — WebSocket; on mount connects to `WS_URL/ws`, filters `message` events by `taskId`, appends `log` lines, disconnects on unmount

- [ ] **Step 1: Create use-tasks.ts**

```typescript
// foreman/apps/web/src/hooks/use-tasks.ts
'use client';
import useSWR from 'swr';
import type { Task } from '@foreman/types';
import { apiClient } from '@/lib/api-client';

export function useTasks() {
  const { data, isLoading, mutate } = useSWR<Task[]>('/tasks', () => apiClient.tasks.list(), {
    refreshInterval: 3000,
    revalidateOnFocus: false,
  });
  return { tasks: data ?? [], isLoading, mutate };
}
```

- [ ] **Step 2: Create use-repos.ts**

```typescript
// foreman/apps/web/src/hooks/use-repos.ts
'use client';
import useSWR from 'swr';
import type { Repo } from '@foreman/types';
import { apiClient } from '@/lib/api-client';

export function useRepos() {
  const { data, isLoading, mutate } = useSWR<Repo[]>('/repos', () => apiClient.repos.list());
  return { repos: data ?? [], isLoading, mutate };
}
```

- [ ] **Step 3: Create use-task-log.ts**

```typescript
// foreman/apps/web/src/hooks/use-task-log.ts
'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { WsMessage } from '@foreman/types';
import { WS_URL } from '@/lib/constants';

export function useTaskLog(taskId: string | null, initialLog: string) {
  const [lines, setLines] = useState<string[]>(() =>
    initialLog ? initialLog.split('\n').filter(Boolean) : [],
  );
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  useEffect(() => {
    setLines(initialLog ? initialLog.split('\n').filter(Boolean) : []);
  }, [taskId, initialLog]);

  useEffect(() => {
    if (!taskId) return;

    const socket = io(`${WS_URL}/ws`, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('message', (msg: WsMessage) => {
      if (msg.taskId !== taskId) return;
      if (msg.type === 'log') {
        setLines((prev) => [...prev, msg.line]);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [taskId]);

  return { lines };
}
```

- [ ] **Step 4: Commit**

```bash
cd foreman
git add apps/web/src/hooks/
git commit -m "feat(web): add useTasks, useRepos, useTaskLog hooks"
```

---

### Task 4: Tasks Page — TaskForm + TaskList + LogViewer

**Files:**
- Create: `foreman/apps/web/src/app/tasks/page.tsx`
- Create: `foreman/apps/web/src/components/tasks/task-form.tsx`
- Create: `foreman/apps/web/src/components/tasks/task-list.tsx`
- Create: `foreman/apps/web/src/components/tasks/log-viewer.tsx`

**Interfaces:**
- Consumes: `useTasks`, `useRepos`, `useTaskLog`, `apiClient.tasks`
- Produces: two-panel layout — left (TaskForm + TaskList), right (LogViewer for selected task)

- [ ] **Step 1: Create task-form.tsx**

```tsx
// foreman/apps/web/src/components/tasks/task-form.tsx
'use client';
import { useState } from 'react';
import type { Repo, AgentType } from '@foreman/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';

interface Props { repos: Repo[]; onCreated: () => void; }

const AGENT_TYPES: AgentType[] = ['feature', 'bugfix', 'support', 'improve'];

export function TaskForm({ repos, onCreated }: Props) {
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
        <Label className="text-xs text-slate-400">Repo</Label>
        <Select value={repoId} onValueChange={setRepoId}>
          <SelectTrigger className="h-8 text-sm bg-slate-900 border-slate-700"><SelectValue placeholder="Select repo" /></SelectTrigger>
          <SelectContent>{repos.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
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
```

- [ ] **Step 2: Create task-list.tsx**

```tsx
// foreman/apps/web/src/components/tasks/task-list.tsx
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
```

- [ ] **Step 3: Create log-viewer.tsx**

```tsx
// foreman/apps/web/src/components/tasks/log-viewer.tsx
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
```

- [ ] **Step 4: Create tasks/page.tsx**

```tsx
// foreman/apps/web/src/app/tasks/page.tsx
import { TasksClient } from './tasks-client';
import { apiClient } from '@/lib/api-client';

export default async function TasksPage() {
  const [tasks, repos] = await Promise.all([
    apiClient.tasks.list().catch(() => []),
    apiClient.repos.list().catch(() => []),
  ]);
  return <TasksClient initialTasks={tasks} initialRepos={repos} />;
}
```

- [ ] **Step 5: Create tasks/tasks-client.tsx**

```tsx
// foreman/apps/web/src/app/tasks/tasks-client.tsx
'use client';
import { useState } from 'react';
import type { Task, Repo } from '@foreman/types';
import { useTasks } from '@/hooks/use-tasks';
import { useRepos } from '@/hooks/use-repos';
import { TaskForm } from '@/components/tasks/task-form';
import { TaskList } from '@/components/tasks/task-list';
import { LogViewer } from '@/components/tasks/log-viewer';

interface Props { initialTasks: Task[]; initialRepos: Repo[]; }

export function TasksClient({ initialTasks, initialRepos }: Props) {
  const { tasks, mutate } = useTasks();
  const { repos } = useRepos();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const allTasks = tasks.length > 0 ? tasks : initialTasks;
  const allRepos = repos.length > 0 ? repos : initialRepos;
  const selectedTask = allTasks.find((t) => t.id === selectedId);

  return (
    <div className="flex gap-4 h-[calc(100vh-80px)]">
      <div className="w-96 flex-none flex flex-col gap-4 overflow-y-auto">
        <TaskForm repos={allRepos} onCreated={mutate} />
        <TaskList tasks={allTasks} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className="flex-1 min-h-0">
        <LogViewer taskId={selectedId} initialLog={selectedTask?.log ?? ''} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
cd foreman
git add apps/web/src/app/tasks/ apps/web/src/components/tasks/
git commit -m "feat(web): add Tasks page with TaskForm, TaskList, LogViewer"
```

---

### Task 5: Repos Page + Settings Page

**Files:**
- Create: `foreman/apps/web/src/app/repos/page.tsx`
- Create: `foreman/apps/web/src/components/repos/repo-manager.tsx`
- Create: `foreman/apps/web/src/app/settings/page.tsx`
- Create: `foreman/apps/web/src/components/settings/settings-form.tsx`

- [ ] **Step 1: Create repo-manager.tsx**

```tsx
// foreman/apps/web/src/components/repos/repo-manager.tsx
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
```

- [ ] **Step 2: Create repos/page.tsx**

```tsx
// foreman/apps/web/src/app/repos/page.tsx
import { apiClient } from '@/lib/api-client';
import { RepoManager } from '@/components/repos/repo-manager';

export default async function ReposPage() {
  const repos = await apiClient.repos.list().catch(() => []);
  return <RepoManager initialRepos={repos} />;
}
```

- [ ] **Step 3: Create settings-form.tsx**

```tsx
// foreman/apps/web/src/components/settings/settings-form.tsx
'use client';
import { useState } from 'react';
import type { Setting, SettingKey } from '@foreman/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';

const FIELDS: { key: SettingKey; label: string; placeholder: string; type: 'text' | 'password' | 'number' }[] = [
  { key: 'jira_base_url', label: 'Jira Base URL', placeholder: 'https://yourorg.atlassian.net', type: 'text' },
  { key: 'jira_email', label: 'Jira Email', placeholder: 'you@company.com', type: 'text' },
  { key: 'jira_api_token', label: 'Jira API Token', placeholder: '••••••••', type: 'password' },
  { key: 'github_token', label: 'GitHub Token', placeholder: 'ghp_••••••••', type: 'password' },
  { key: 'poll_interval_ms', label: 'Poll Interval (ms)', placeholder: '60000', type: 'number' },
];

export function SettingsForm({ initialSettings }: { initialSettings: Setting[] }) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(initialSettings.map((s) => [s.key, s.value === '***' ? '' : s.value])),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isConfigured = (key: string) => {
    const initial = initialSettings.find((s) => s.key === key);
    return initial?.value === '***' || (initial?.value !== undefined && initial.value !== '');
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const settings = Object.entries(values)
        .filter(([, v]) => v !== '')
        .map(([key, value]) => ({ key, value }));
      await apiClient.settings.upsert(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="max-w-lg space-y-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-1">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-slate-300">{f.label}</Label>
            <span className={`text-xs px-1.5 py-0.5 rounded ${isConfigured(f.key) ? 'bg-green-900 text-green-300' : 'bg-slate-800 text-slate-500'}`}>
              {isConfigured(f.key) ? 'Configured' : 'Not set'}
            </span>
          </div>
          <Input
            type={f.type}
            value={values[f.key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            placeholder={f.placeholder}
            className="bg-slate-900 border-slate-700"
          />
        </div>
      ))}
      <Button type="submit" disabled={saving}>
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Settings'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Create settings/page.tsx**

```tsx
// foreman/apps/web/src/app/settings/page.tsx
import { apiClient } from '@/lib/api-client';
import { SettingsForm } from '@/components/settings/settings-form';

export default async function SettingsPage() {
  const settings = await apiClient.settings.list().catch(() => []);
  return <SettingsForm initialSettings={settings} />;
}
```

- [ ] **Step 5: Install deps and verify build**

```bash
cd foreman
pnpm install
pnpm --filter @foreman/web build
```
Expected: Next.js build completes successfully, no type errors

- [ ] **Step 6: Start dev server and smoke test manually**

```bash
cd foreman/apps/web
NEXT_PUBLIC_API_URL=http://localhost:3001 NEXT_PUBLIC_API_KEY=test NEXT_PUBLIC_WS_URL=http://localhost:3001 pnpm dev
```

Open `http://localhost:3000` in browser — verify:
- Redirects to `/tasks`
- Navigation links work (Tasks / Repos / Settings)
- Settings page loads with "Not set" badges
- Dark theme applied throughout

- [ ] **Step 7: Commit**

```bash
cd foreman
git add apps/web/src/
git commit -m "feat(web): add Tasks, Repos, Settings pages with all interactive components"
```

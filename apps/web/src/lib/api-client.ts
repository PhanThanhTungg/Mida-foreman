import type { AgentType, Setting, Task, TaskProgressEvent, Workspace, WorkspaceVerifyResult } from '@foreman/types';
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
    progress: (id: string) => request<TaskProgressEvent[]>(`/tasks/${id}/progress`),
    create: (dto: { issueKey: string; title: string; repoId: string; agentType: AgentType; maxRounds?: number }) =>
      request<Task>('/tasks', { method: 'POST', body: JSON.stringify(dto) }),
    retry: (id: string) => request<Task>(`/tasks/${id}/retry`, { method: 'POST' }),
    delete: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
  },
  workspaces: {
    list: () => request<Workspace[]>('/workspaces'),
    create: (dto: { name: string; path: string; description?: string }) =>
      request<Workspace>('/workspaces', { method: 'POST', body: JSON.stringify(dto) }),
    update: (id: string, dto: Partial<{ name: string; path: string; description: string; active: boolean }>) =>
      request<Workspace>(`/workspaces/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
    delete: (id: string) => request<void>(`/workspaces/${id}`, { method: 'DELETE' }),
    verify: (id: string) => request<WorkspaceVerifyResult>(`/workspaces/${id}/verify`, { method: 'POST' }),
  },
  settings: {
    list: () => request<Setting[]>('/settings'),
    upsert: (settings: Setting[]) =>
      request<Setting[]>('/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),
  },
};

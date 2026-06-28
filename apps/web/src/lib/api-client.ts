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

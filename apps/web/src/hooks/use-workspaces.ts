'use client';
import useSWR from 'swr';
import type { Workspace } from '@foreman/types';
import { apiClient } from '@/lib/api-client';

export function useWorkspaces() {
  const { data, isLoading, mutate } = useSWR<Workspace[]>('/workspaces', () => apiClient.workspaces.list());
  return { workspaces: data ?? [], isLoading, mutate };
}

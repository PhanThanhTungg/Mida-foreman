'use client';
import useSWR from 'swr';
import type { Repo } from '@foreman/types';
import { apiClient } from '@/lib/api-client';

export function useRepos() {
  const { data, isLoading, mutate } = useSWR<Repo[]>('/repos', () => apiClient.repos.list());
  return { repos: data ?? [], isLoading, mutate };
}

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

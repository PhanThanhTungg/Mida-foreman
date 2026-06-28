'use client';

import { useEffect } from 'react';
import { io } from 'socket.io-client';
import useSWR from 'swr';
import type { TaskProgressEvent, WsMessage } from '@foreman/types';
import { apiClient } from '@/lib/api-client';
import { WS_URL } from '@/lib/constants';

function sortEvents(events: TaskProgressEvent[]): TaskProgressEvent[] {
  return [...events].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function useTaskProgress(taskId: string | null) {
  const { data, isLoading, mutate } = useSWR<TaskProgressEvent[]>(
    taskId ? `/tasks/${taskId}/progress` : null,
    () => apiClient.tasks.progress(taskId as string),
    {
      refreshInterval: 3000,
      revalidateOnFocus: false,
    },
  );

  useEffect(() => {
    if (!taskId) return;
    const socket = io(`${WS_URL}/ws`, { transports: ['websocket'] });
    socket.on('message', (msg: WsMessage) => {
      if (msg.taskId !== taskId || msg.type !== 'progress') return;
      mutate((current = []) => {
        const next = new Map(current.map((event) => [event.id, event]));
        next.set(msg.event.id, msg.event);
        return sortEvents(Array.from(next.values()));
      }, false);
    });
    return () => { socket.disconnect(); };
  }, [mutate, taskId]);

  return { events: sortEvents(data ?? []), isLoading, mutate };
}

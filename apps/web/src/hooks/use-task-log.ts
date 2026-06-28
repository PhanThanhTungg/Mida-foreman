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

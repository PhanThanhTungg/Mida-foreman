'use client';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef, useState } from 'react';
import { SquareTerminal } from 'lucide-react';
import { io } from 'socket.io-client';
import type { WsMessage } from '@foreman/types';
import { WS_URL } from '@/lib/constants';

interface Props { taskId: string | null; initialLog: string; }

export function LogViewer({ taskId, initialLog }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import('@xterm/xterm').Terminal | null>(null);
  const fitRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null);
  const [termReady, setTermReady] = useState(false);

  // Initialize terminal once on mount
  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
    ]).then(([{ Terminal }, { FitAddon }]) => {
      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        convertEol: true,
        cursorBlink: false,
        disableStdin: true,
        scrollback: 10000,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 13,
        lineHeight: 1.4,
        theme: {
          background: '#000000',
          foreground: '#d1d7e0',
          cursor: '#c9d1d9',
          black: '#484f58',
          red: '#ff7b72',
          green: '#3fb950',
          yellow: '#d29922',
          blue: '#58a6ff',
          magenta: '#bc8cff',
          cyan: '#39c5cf',
          white: '#b1bac4',
          brightBlack: '#6e7681',
          brightRed: '#ffa198',
          brightGreen: '#56d364',
          brightYellow: '#e3b341',
          brightBlue: '#79c0ff',
          brightMagenta: '#d2a8ff',
          brightCyan: '#56d4dd',
          brightWhite: '#f0f6fc',
        },
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);

      // Wait for browser layout before measuring dimensions
      requestAnimationFrame(() => {
        if (disposed) return;
        fit.fit();
        termRef.current = term;
        fitRef.current = fit;
        setTermReady(true);
      });
    });

    const observer = new ResizeObserver(() => fitRef.current?.fit());
    observer.observe(containerRef.current);

    return () => {
      disposed = true;
      observer.disconnect();
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Write log whenever terminal becomes ready or task/log changes
  useEffect(() => {
    if (!termReady || !termRef.current) return;
    const term = termRef.current;
    term.clear();
    if (initialLog) {
      for (const line of initialLog.split('\n')) {
        term.writeln(line);
      }
    }
  }, [termReady, taskId, initialLog]);

  // Stream live log lines via WebSocket
  useEffect(() => {
    if (!taskId) return;
    const socket = io(`${WS_URL}/ws`, { transports: ['websocket'] });
    socket.on('message', (msg: WsMessage) => {
      if (msg.taskId !== taskId || msg.type !== 'log') return;
      termRef.current?.writeln(msg.line);
    });
    return () => { socket.disconnect(); };
  }, [taskId]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {!taskId && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex flex-col items-center text-center">
            <SquareTerminal className="mb-4 size-9 text-slate-700" strokeWidth={1.75} />
            <div className="text-sm font-medium text-slate-600">No task selected</div>
            <div className="mt-1 text-xs text-slate-700">Select a task from the list to view its log</div>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ visibility: taskId ? 'visible' : 'hidden' }}
      />
    </div>
  );
}

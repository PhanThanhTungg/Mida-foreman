import type { TaskProgressEvent, TaskStatus } from './task.types';

export type WsMessage =
  | { type: 'log'; taskId: string; line: string }
  | { type: 'status'; taskId: string; status: TaskStatus; round: number }
  | { type: 'progress'; taskId: string; event: TaskProgressEvent };

// foreman/apps/api/src/gateway/foreman.gateway.ts
import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { WsMessage } from '@foreman/types';

@WebSocketGateway({ namespace: '/ws', cors: { origin: '*' } })
export class ForemanGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ForemanGateway.name);

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitLog(taskId: string, line: string): void {
    const msg: WsMessage = { type: 'log', taskId, line };
    this.server.emit('message', msg);
  }

  emitStatus(taskId: string, status: string, round: number): void {
    const msg = { type: 'status' as const, taskId, status: status as 'queued' | 'running' | 'done' | 'failed', round };
    this.server.emit('message', msg);
  }
}

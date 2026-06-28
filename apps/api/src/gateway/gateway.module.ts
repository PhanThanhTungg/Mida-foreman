// foreman/apps/api/src/gateway/gateway.module.ts
import { Module } from '@nestjs/common';
import { ForemanGateway } from './foreman.gateway';

@Module({ providers: [ForemanGateway], exports: [ForemanGateway] })
export class GatewayModule {}

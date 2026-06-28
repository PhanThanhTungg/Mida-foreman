import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation } from '@nestjs/swagger';
import { AgentsRegistry } from './agents.registry';

@ApiTags('agents')
@ApiSecurity('api-key')
@Controller('agent-types')
export class AgentsController {
  constructor(private readonly registry: AgentsRegistry) {}

  @Get()
  @ApiOperation({ summary: 'List all agent type configurations' })
  findAll() { return this.registry.getAll(); }
}

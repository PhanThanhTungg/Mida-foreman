import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation } from '@nestjs/swagger';
import { WorkspacesService } from './repos.service';
import { CreateWorkspaceDto } from './dto/create-repo.dto';
import { UpdateWorkspaceDto } from './dto/update-repo.dto';

@ApiTags('workspaces')
@ApiSecurity('api-key')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  @ApiOperation({ summary: 'List all workspaces' })
  findAll() { return this.workspaces.findAll(); }

  @Post()
  @ApiOperation({ summary: 'Register a new workspace' })
  create(@Body() dto: CreateWorkspaceDto) { return this.workspaces.create(dto); }

  @Put(':id')
  @ApiOperation({ summary: 'Update a workspace' })
  update(@Param('id') id: string, @Body() dto: UpdateWorkspaceDto) { return this.workspaces.update(id, dto); }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a workspace' })
  async remove(@Param('id') id: string) { await this.workspaces.remove(id); }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Verify workspace path and scan sub-repos' })
  verify(@Param('id') id: string) { return this.workspaces.verify(id); }
}

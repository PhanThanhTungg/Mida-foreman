import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation } from '@nestjs/swagger';
import { ReposService } from './repos.service';
import { CreateRepoDto } from './dto/create-repo.dto';
import { UpdateRepoDto } from './dto/update-repo.dto';

@ApiTags('repos')
@ApiSecurity('api-key')
@Controller('repos')
export class ReposController {
  constructor(private readonly repos: ReposService) {}

  @Get()
  @ApiOperation({ summary: 'List all repos' })
  findAll() { return this.repos.findAll(); }

  @Post()
  @ApiOperation({ summary: 'Register a new repo' })
  create(@Body() dto: CreateRepoDto) { return this.repos.create(dto); }

  @Put(':id')
  @ApiOperation({ summary: 'Update a repo' })
  update(@Param('id') id: string, @Body() dto: UpdateRepoDto) { return this.repos.update(id, dto); }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a repo' })
  async remove(@Param('id') id: string) { await this.repos.remove(id); }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Verify repo path + git status' })
  verify(@Param('id') id: string) { return this.repos.verify(id); }
}

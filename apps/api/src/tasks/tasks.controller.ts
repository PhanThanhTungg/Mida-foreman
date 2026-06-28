import { Controller, Get, Post, Delete, Param, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';

@ApiTags('tasks')
@ApiSecurity('api-key')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'List all tasks' })
  findAll() { return this.tasks.findAll(); }

  @Get(':id')
  @ApiOperation({ summary: 'Get a task by ID' })
  findOne(@Param('id') id: string) { return this.tasks.findOne(id); }

  @Post()
  @ApiOperation({ summary: 'Create and enqueue a task' })
  create(@Body() dto: CreateTaskDto) { return this.tasks.create(dto); }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a queued task' })
  async remove(@Param('id') id: string) { await this.tasks.remove(id); }
}

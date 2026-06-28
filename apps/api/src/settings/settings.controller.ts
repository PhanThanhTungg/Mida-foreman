import { Controller, Get, Put, Body } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpsertSettingsDto } from './dto/upsert-settings.dto';

@ApiTags('settings')
@ApiSecurity('api-key')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'List all settings (sensitive values masked)' })
  findAll() { return this.settings.findAll(); }

  @Put()
  @ApiOperation({ summary: 'Upsert settings' })
  upsert(@Body() dto: UpsertSettingsDto) { return this.settings.upsert(dto.settings); }
}

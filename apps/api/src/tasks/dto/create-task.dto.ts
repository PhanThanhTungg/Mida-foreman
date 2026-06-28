import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AgentType } from '@foreman/types';

export class CreateTaskDto {
  @ApiProperty({ example: 'MAH-42' })
  @IsString() @IsNotEmpty() issueKey!: string;

  @ApiProperty({ example: 'Fix login redirect on mobile' })
  @IsString() @IsNotEmpty() title!: string;

  @ApiProperty({ example: 'repo-id-here' })
  @IsString() @IsNotEmpty() repoId!: string;

  @ApiProperty({ enum: ['feature', 'bugfix', 'support', 'improve'] })
  @IsEnum(['feature', 'bugfix', 'support', 'improve']) agentType!: AgentType;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(10) maxRounds?: number;
}

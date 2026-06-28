import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'my-projects' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '/home/user/projects' })
  @IsString()
  @IsNotEmpty()
  path!: string;

  @ApiPropertyOptional({ example: 'Main projects folder' })
  @IsOptional()
  @IsString()
  description?: string;
}

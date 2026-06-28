import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRepoDto {
  @ApiProperty({ example: 'my-app' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '/home/user/repos/my-app' })
  @IsString()
  @IsNotEmpty()
  path!: string;

  @ApiProperty({ example: 'org/my-app' })
  @IsString()
  @IsNotEmpty()
  githubRepo!: string;

  @ApiPropertyOptional({ example: 'Main customer-facing app' })
  @IsOptional()
  @IsString()
  description?: string;
}

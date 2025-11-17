import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';

export class CreatePlatformDto {
  @ApiProperty({ description: 'Platform name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Short platform name (e.g., PS4, Xbox360)', required: false })
  @IsString()
  @IsOptional()
  shortName?: string;

  @ApiProperty({ description: 'Manufacturer name', required: false })
  @IsString()
  @IsOptional()
  manufacturer?: string;

  @ApiProperty({ description: 'Console generation', required: false })
  @IsString()
  @IsOptional()
  generation?: string;

  @ApiProperty({ description: 'Release year', required: false })
  @IsInt()
  @IsOptional()
  releaseYear?: number;

  @ApiProperty({ description: 'Platform type (Console, Portable, PC, etc.)', required: false })
  @IsString()
  @IsOptional()
  platformType?: string;

  @ApiProperty({ description: 'Sort order for display', required: false, default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

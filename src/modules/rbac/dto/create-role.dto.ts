import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsInt, MinLength, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'content_manager', description: 'Unique role identifier (kebab-case)' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  roleName: string;

  @ApiProperty({ example: 'Content Manager', description: 'Display name for the role' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  displayName: string;

  @ApiProperty({ required: false, description: 'Detailed description of the role' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, example: '#3B82F6', description: 'Hex color for UI display' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ default: 0, description: 'Priority level (higher = more important)' })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiProperty({ default: false, description: 'System role (cannot be deleted)' })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;

  @ApiProperty({ default: true, description: 'Is the role active?' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

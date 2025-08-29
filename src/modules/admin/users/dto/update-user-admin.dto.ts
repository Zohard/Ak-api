import {
  IsOptional,
  IsString,
  IsEmail,
  IsArray,
  IsIn,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserAdminDto {
  @ApiPropertyOptional({
    description: 'Username of the user',
  })
  @IsOptional()
  @IsString()
  member_name?: string;

  @ApiPropertyOptional({
    description: 'Display name of the user',
  })
  @IsOptional()
  @IsString()
  real_name?: string;

  @ApiPropertyOptional({
    description: 'Email address of the user',
  })
  @IsOptional()
  @IsEmail()
  email_address?: string;

  @ApiPropertyOptional({
    description: 'User biography',
  })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({
    description: 'User signature',
  })
  @IsOptional()
  @IsString()
  signature?: string;

  @ApiPropertyOptional({
    description: 'User location',
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    description: 'User website URL',
  })
  @IsOptional()
  @IsString()
  website_url?: string;

  @ApiPropertyOptional({
    description: 'User groups to assign',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groups?: string[];

  @ApiPropertyOptional({
    description: 'Whether the user is banned',
  })
  @IsOptional()
  @IsBoolean()
  is_banned?: boolean;

  @ApiPropertyOptional({
    description: 'Ban reason',
  })
  @IsOptional()
  @IsString()
  ban_reason?: string;

  @ApiPropertyOptional({
    description: 'Whether the user is activated',
  })
  @IsOptional()
  @IsBoolean()
  is_activated?: boolean;
}

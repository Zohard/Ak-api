import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsEmail, IsInt, Min, Max } from 'class-validator';

export class AddWriterDto {
  @ApiProperty({
    description: 'Custom username for the writer (optional, uses SMF member_name if not provided)',
    required: false,
  })
  @IsOptional()
  @IsString()
  user_login?: string;

  @ApiProperty({
    description: 'Password for the writer account (optional, generates random if not provided)',
    required: false,
  })
  @IsOptional()
  @IsString()
  user_pass?: string;

  @ApiProperty({
    description: 'Nice name for URLs (optional, uses real_name if not provided)',
    required: false,
  })
  @IsOptional()
  @IsString()
  user_nicename?: string;

  @ApiProperty({
    description: 'Email address (optional, uses SMF email if not provided)',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  user_email?: string;

  @ApiProperty({
    description: 'Website URL (optional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  user_url?: string;

  @ApiProperty({
    description: 'User activation key (optional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  user_activation_key?: string;

  @ApiProperty({
    description: 'User status (0 = active, 1 = pending)',
    required: false,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  user_status?: number;

  @ApiProperty({
    description: 'Display name (optional, uses real_name if not provided)',
    required: false,
  })
  @IsOptional()
  @IsString()
  display_name?: string;
}
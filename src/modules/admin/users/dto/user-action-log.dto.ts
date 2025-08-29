import { IsString, IsOptional, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserActionLogDto {
  @ApiProperty({
    description: 'Action taken on the user',
    examples: [
      'ban',
      'unban',
      'promote',
      'demote',
      'edit_profile',
      'reset_password',
    ],
  })
  @IsString()
  action: string;

  @ApiProperty({
    description: 'ID of the user affected',
  })
  @IsInt()
  target_user_id: number;

  @ApiPropertyOptional({
    description: 'Reason for the action',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata about the action',
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

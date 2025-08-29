import {
  IsNotEmpty,
  IsString,
  IsIn,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ModerateCommentDto {
  @ApiProperty({
    description: 'Moderation status',
    enum: ['approved', 'pending', 'rejected'],
  })
  @IsNotEmpty()
  @IsString()
  @IsIn(['approved', 'pending', 'rejected'])
  status: string;

  @ApiProperty({
    description: 'Moderation action',
    enum: ['approve', 'reject', 'pending'],
  })
  @IsNotEmpty()
  @IsString()
  @IsIn(['approve', 'reject', 'pending'])
  action: string;

  @ApiPropertyOptional({
    description: 'Reason for moderation action',
    example: 'Spam content detected',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

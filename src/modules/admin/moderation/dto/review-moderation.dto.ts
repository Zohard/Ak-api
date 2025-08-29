import { IsInt, IsString, IsIn, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewModerationActionDto {
  @ApiProperty({
    description: 'Action to take on the review',
    enum: ['approve', 'reject', 'delete', 'edit'],
  })
  @IsString()
  @IsIn(['approve', 'reject', 'delete', 'edit'])
  action: string;

  @ApiPropertyOptional({
    description: 'Reason for the moderation action',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'New title if editing',
  })
  @IsOptional()
  @IsString()
  new_title?: string;

  @ApiPropertyOptional({
    description: 'New content if editing',
  })
  @IsOptional()
  @IsString()
  new_content?: string;

  @ApiPropertyOptional({
    description: 'New rating if editing',
  })
  @IsOptional()
  @IsInt()
  new_rating?: number;
}

export class BulkModerationDto {
  @ApiProperty({
    description: 'Array of review IDs to moderate',
    type: [Number],
  })
  @IsInt({ each: true })
  reviewIds: number[];

  @ApiProperty({
    description: 'Action to take on all reviews',
    enum: ['approve', 'reject', 'delete'],
  })
  @IsString()
  @IsIn(['approve', 'reject', 'delete'])
  action: string;

  @ApiPropertyOptional({
    description: 'Reason for the bulk moderation action',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ModerationQueueQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by review status',
    enum: ['pending', 'approved', 'rejected', 'all'],
  })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'all'])
  status?: string = 'pending';

  @ApiPropertyOptional({
    description: 'Filter by content type',
    enum: ['anime', 'manga', 'all'],
  })
  @IsOptional()
  @IsIn(['anime', 'manga', 'all'])
  contentType?: string = 'all';

  @ApiPropertyOptional({
    description: 'Search term for review title or content',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @IsInt()
  limit?: number = 20;
}

import { IsInt, IsString, IsIn, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ContentModerationActionDto {
  @ApiProperty({
    description: 'Content type',
    enum: ['anime', 'manga', 'business', 'article'],
  })
  @IsString()
  @IsIn(['anime', 'manga', 'business', 'article'])
  contentType: string;

  @ApiProperty({
    description: 'Content ID',
  })
  @IsInt()
  contentId: number;

  @ApiProperty({
    description: 'Moderation action',
    enum: ['approve', 'reject', 'flag', 'unflag', 'feature', 'unfeature'],
  })
  @IsString()
  @IsIn(['approve', 'reject', 'flag', 'unflag', 'feature', 'unfeature'])
  action: string;

  @ApiPropertyOptional({
    description: 'Reason for the moderation action',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata for the action',
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class ReportContentDto {
  @ApiProperty({
    description: 'Content type being reported',
    enum: ['anime', 'manga', 'business', 'article', 'review', 'user'],
  })
  @IsString()
  @IsIn(['anime', 'manga', 'business', 'article', 'review', 'user'])
  contentType: string;

  @ApiProperty({
    description: 'ID of the content being reported',
  })
  @IsInt()
  contentId: number;

  @ApiProperty({
    description: 'Reason for reporting',
    enum: [
      'inappropriate_content',
      'spam',
      'copyright_violation',
      'false_information',
      'harassment',
      'other',
    ],
  })
  @IsString()
  @IsIn([
    'inappropriate_content',
    'spam',
    'copyright_violation',
    'false_information',
    'harassment',
    'other',
  ])
  reason: string;

  @ApiPropertyOptional({
    description: 'Additional details about the report',
  })
  @IsOptional()
  @IsString()
  details?: string;
}

export class ModerationReportQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by report status',
    enum: ['pending', 'reviewed', 'resolved', 'dismissed', 'all'],
  })
  @IsOptional()
  @IsIn(['pending', 'reviewed', 'resolved', 'dismissed', 'all'])
  status?: string = 'pending';

  @ApiPropertyOptional({
    description: 'Filter by content type',
    enum: ['anime', 'manga', 'business', 'article', 'review', 'user', 'all'],
  })
  @IsOptional()
  @IsIn(['anime', 'manga', 'business', 'article', 'review', 'user', 'all'])
  contentType?: string = 'all';

  @ApiPropertyOptional({
    description: 'Filter by report reason',
  })
  @IsOptional()
  @IsString()
  reason?: string;

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

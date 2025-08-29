import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsObject,
} from 'class-validator';

export class UpdatePreferencesDto {
  @ApiProperty({
    description: 'Receive email notifications for new reviews',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailNewReview?: boolean;

  @ApiProperty({
    description: 'Receive email notifications for new animes',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailNewAnime?: boolean;

  @ApiProperty({
    description: 'Receive email notifications for new mangas',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailNewManga?: boolean;

  @ApiProperty({
    description: 'Receive email notifications when reviews are moderated',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailReviewModerated?: boolean;

  @ApiProperty({
    description: 'Receive email notifications for security alerts',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailSecurityAlerts?: boolean;

  @ApiProperty({
    description: 'Receive email notifications for marketing',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailMarketing?: boolean;
}

export class SendNotificationDto {
  @ApiProperty({
    description: 'Target user ID',
    example: 12345,
  })
  @IsNumber()
  userId: number;

  @ApiProperty({
    description: 'Notification type',
    enum: [
      'new_review',
      'new_anime',
      'new_manga',
      'review_moderated',
      'security_alert',
      'marketing',
    ],
    example: 'new_review',
  })
  @IsEnum([
    'new_review',
    'new_anime',
    'new_manga',
    'review_moderated',
    'security_alert',
    'marketing',
  ])
  type:
    | 'new_review'
    | 'new_anime'
    | 'new_manga'
    | 'review_moderated'
    | 'security_alert'
    | 'marketing';

  @ApiProperty({
    description: 'Notification title',
    example: 'Nouvelle critique disponible',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Notification message',
    example: 'Une nouvelle critique a été ajoutée pour Naruto.',
  })
  @IsString()
  message: string;

  @ApiProperty({
    description: 'Notification priority',
    enum: ['low', 'medium', 'high'],
    example: 'medium',
    required: false,
  })
  @IsOptional()
  @IsEnum(['low', 'medium', 'high'])
  priority: 'low' | 'medium' | 'high' = 'medium';

  @ApiProperty({
    description: 'Additional notification data',
    example: { reviewId: 123, animeId: 456 },
    required: false,
  })
  @IsOptional()
  @IsObject()
  data?: any;
}

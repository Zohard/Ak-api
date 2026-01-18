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
    description: 'Receive email notifications for new seasons of animes',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailNewSeasonAnime?: boolean;

  @ApiProperty({
    description: 'Receive web notifications for new seasons of animes',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  webNewSeasonAnime?: boolean;

  @ApiProperty({
    description: 'Receive email notifications when reviews are moderated',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailReviewModerated?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  webReviewModerated?: boolean;

  @ApiProperty({
    description: 'Receive email notifications for security alerts',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailSecurityAlerts?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  webSecurityAlerts?: boolean;

  @ApiProperty({
    description: 'Receive email notifications for marketing',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailMarketing?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  webMarketing?: boolean;

  @ApiProperty({
    description: 'Receive email notifications when a review is liked',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailReviewLiked?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  webReviewLiked?: boolean;

  @ApiProperty({
    description: 'Receive email notifications when related content is added',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailRelatedContent?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  webRelatedContent?: boolean;

  @ApiProperty({
    description: 'Receive email notifications for friend requests',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailFriendRequest?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  webFriendRequest?: boolean;

  @ApiProperty({
    description: 'Receive email notifications when friend request is accepted',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailFriendAccepted?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  webFriendAccepted?: boolean;

  @ApiProperty({
    description: 'Receive email notifications for event voting',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailEventVoting?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  webEventVoting?: boolean;

  @ApiProperty({
    description: 'Receive email notifications for new reviews',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailNewReview?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  webNewReview?: boolean;

  // Compatibility fields for old frontend versions or internal triggers
  @IsOptional()
  @IsBoolean()
  emailNewAnime?: boolean;

  @IsOptional()
  @IsBoolean()
  webNewAnime?: boolean;

  @IsOptional()
  @IsBoolean()
  emailNewManga?: boolean;

  @IsOptional()
  @IsBoolean()
  webNewManga?: boolean;
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
      'new_season_anime',
      'review_moderated',
      'security_alert',
      'marketing',
      'friend_request',
      'friend_accepted',
      'event_voting_started',
      'event_voting_ended',
      'related_content_added',
    ],
    example: 'new_review',
  })
  @IsEnum([
    'new_review',
    'new_season_anime',
    'review_moderated',
    'security_alert',
    'marketing',
    'friend_request',
    'friend_accepted',
    'event_voting_started',
    'event_voting_ended',
    'related_content_added',
  ])
  type:
    | 'new_review'
    | 'new_season_anime'
    | 'review_moderated'
    | 'security_alert'
    | 'marketing'
    | 'friend_request'
    | 'friend_accepted'
    | 'event_voting_started'
    | 'event_voting_ended'
    | 'related_content_added';

  @ApiProperty({
    description: 'Notification title',
    example: 'Nouvelle critique disponible',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Notification message',
    example: 'Une nouvelle critique a été ajoutée.',
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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ActivityItemDto {
  @ApiProperty({ example: '12345' })
  id: string;

  @ApiProperty({ example: 'rating' })
  type: 'rating' | 'review' | 'list_addition' | 'top_list' | 'following';

  @ApiProperty({ example: 123 })
  userId: number;

  @ApiProperty({ example: 'Sacrilege' })
  userName: string;

  @ApiProperty({ example: '../img/avatar123.jpg' })
  userAvatar: string;

  @ApiProperty({ example: '2025-11-14T10:30:00Z' })
  createdAt: string;

  @ApiProperty({ example: 'Hier' })
  timeAgo: string;

  @ApiPropertyOptional({ example: 'anime' })
  contentType?: 'anime' | 'manga' | 'game' | 'user';

  @ApiPropertyOptional({ example: 456 })
  contentId?: number;

  @ApiPropertyOptional({ example: 'Indociles' })
  contentTitle?: string;

  @ApiPropertyOptional({ example: 'https://example.com/image.jpg' })
  contentImage?: string;

  @ApiPropertyOptional({ example: 6 })
  rating?: number;

  @ApiPropertyOptional({ example: 'Critique' })
  reviewTitle?: string;

  @ApiPropertyOptional({ example: 'Je m\'installe à l\'un des sièges du Bird\'s...' })
  reviewExcerpt?: string;

  @ApiPropertyOptional({ example: 'Ma liste de favoris' })
  listName?: string;

  @ApiPropertyOptional({ example: 7 })
  itemsCount?: number;

  @ApiPropertyOptional({ example: 'David Nguyen' })
  followedUserName?: string;

  @ApiPropertyOptional({ example: 456 })
  followedUserId?: number;

  @ApiPropertyOptional({ example: '../img/avatar456.jpg' })
  followedUserAvatar?: string;

  @ApiProperty({ example: 'a attribué 6/10 à la série Indociles' })
  actionText: string;
}

export class ActivityFeedQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (default: 1)',
    example: 1,
    minimum: 1
  })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page (default: 20, max: 50)',
    example: 20,
    minimum: 1,
    maximum: 50
  })
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by activity type',
    example: 'rating',
    enum: ['rating', 'review', 'list_addition', 'top_list', 'following', 'all']
  })
  type?: string = 'all';

  @ApiPropertyOptional({
    description: 'Filter by content type',
    example: 'anime',
    enum: ['anime', 'manga', 'game', 'all']
  })
  contentType?: string = 'all';
}

export class ActivityFeedResponseDto {
  @ApiProperty({ type: [ActivityItemDto] })
  activities: ActivityItemDto[];

  @ApiProperty({ example: 50 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasMore: boolean;
}

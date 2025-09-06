import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, MinLength, IsArray, ArrayMaxSize, IsOptional } from 'class-validator';

export class AddFriendDto {
  @ApiProperty({
    description: 'ID of the user to add as friend',
    example: 123
  })
  @IsNumber()
  @IsNotEmpty()
  targetUserId: number;
}

export class RemoveFriendDto {
  @ApiProperty({
    description: 'ID of the user to remove from friends',
    example: 123
  })
  @IsNumber()
  @IsNotEmpty()
  targetUserId: number;
}

export class SearchUsersDto {
  @ApiProperty({
    description: 'Search query (minimum 2 characters)',
    example: 'john',
    minLength: 2
  })
  @IsString()
  @MinLength(2, { message: 'Search query must be at least 2 characters long' })
  query: string;

  @ApiPropertyOptional({
    description: 'Maximum number of results (1-50)',
    example: 10,
    minimum: 1,
    maximum: 50
  })
  @IsOptional()
  @IsNumber()
  limit?: number = 10;
}

export class BulkFriendsDto {
  @ApiProperty({
    description: 'Array of user IDs to add/remove as friends',
    example: [123, 456, 789],
    type: [Number]
  })
  @IsArray()
  @ArrayMaxSize(10, { message: 'Cannot process more than 10 users at once' })
  @IsNumber({}, { each: true, message: 'All user IDs must be numbers' })
  userIds: number[];
}

export class FriendResponseDto {
  @ApiProperty({ example: 123 })
  id: number;

  @ApiProperty({ example: 'John Doe' })
  realName: string;

  @ApiProperty({ example: 1640995200 })
  lastLogin: number;

  @ApiPropertyOptional({ example: '../img/avatar123.jpg' })
  avatar?: string;

  @ApiPropertyOptional({ example: true })
  isMutual?: boolean;

  @ApiPropertyOptional({ example: '2 jours' })
  lastLoginFormatted?: string;
}

export class FriendshipStatsDto {
  @ApiProperty({ example: 15 })
  totalFriends: number;

  @ApiProperty({ example: 12 })
  mutualFriends: number;

  @ApiProperty({ example: 8 })
  recentlyActive: number;
}

export class FriendsListResponseDto {
  @ApiProperty({ type: [FriendResponseDto] })
  friends: FriendResponseDto[];

  @ApiProperty({ type: FriendshipStatsDto })
  stats: FriendshipStatsDto;
}

export class FriendshipStatusDto {
  @ApiProperty({ example: true })
  areFriends: boolean;

  @ApiProperty({ example: true })
  isMutual: boolean;

  @ApiProperty({ example: true })
  targetHasUser: boolean;
}

export class AddFriendResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Friend added successfully' })
  message: string;

  @ApiProperty({ example: true })
  isMutual: boolean;
}

export class RemoveFriendResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Friend removed successfully' })
  message: string;
}

export class SearchResultDto {
  @ApiProperty({ example: 123 })
  id: number;

  @ApiProperty({ example: 'John Doe' })
  realName: string;

  @ApiProperty({ example: '../img/avatar123.jpg' })
  avatar: string;

  @ApiProperty({ example: false })
  areFriends: boolean;

  @ApiProperty({ example: false })
  isMutual: boolean;
}

export class FriendRecommendationDto {
  @ApiProperty({ example: 123 })
  id: number;

  @ApiProperty({ example: 'Jane Smith' })
  realName: string;

  @ApiProperty({ example: '../img/avatar123.jpg' })
  avatar: string;

  @ApiProperty({ example: 3 })
  mutualFriendsCount: number;

  @ApiProperty({
    example: ['John Doe', 'Bob Johnson'],
    type: [String]
  })
  mutualFriends: string[];
}

export class BulkOperationResultDto {
  @ApiProperty({ example: 123 })
  userId: number;

  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Friend added successfully' })
  message: string;
}

export class BulkFriendsResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 3 })
  added?: number;

  @ApiProperty({ example: 2 })
  removed?: number;

  @ApiProperty({ example: 1 })
  failed: number;

  @ApiProperty({ type: [BulkOperationResultDto] })
  results: BulkOperationResultDto[];
}
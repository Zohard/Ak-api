import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CommentQueryDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Article ID to filter comments' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  articleId?: number;

  @ApiPropertyOptional({
    description: 'Comment status',
    enum: ['all', 'approved', 'pending', 'rejected'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'approved', 'pending', 'rejected', 'spam'])
  status?: string = 'approved';

  @ApiPropertyOptional({
    description: 'Search term for comment content and author',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Member ID to filter comments' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  memberId?: number;

  @ApiPropertyOptional({ description: 'User ID to filter comments' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    default: 'commentDate',
  })
  @IsOptional()
  @IsString()
  sort?: string = 'commentDate';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  order?: string = 'desc';
}

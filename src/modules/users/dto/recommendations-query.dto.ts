import { IsOptional, IsInt, IsString, Min, MaxLength, Matches, IsIn } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Sanitize string input to prevent SQL injection
 * Removes any characters that could be used in SQL injection attacks
 */
function sanitizeTagInput(value: string): string {
  if (!value) return value;
  // Remove SQL injection patterns and dangerous characters
  // Allow only: letters (including unicode), numbers, spaces, hyphens, commas, and apostrophes
  return value
    .replace(/[;'"\\`\$\{\}\[\]\(\)]/g, '') // Remove dangerous chars
    .replace(/--/g, '') // Remove SQL comments
    .replace(/\/\*/g, '') // Remove block comment start
    .replace(/\*\//g, '') // Remove block comment end
    .trim();
}

export class RecommendationsQueryDto {
  @ApiPropertyOptional({ description: 'Number of results per page', example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Sort by (rating, popularity, date, title)' })
  @IsOptional()
  @IsIn(['rating', 'popularity', 'date', 'title'])
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Filter by genre(s), comma-separated' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => sanitizeTagInput(value))
  genres?: string;

  @ApiPropertyOptional({ description: 'Filter by genre (deprecated, use genres)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => sanitizeTagInput(value))
  genre?: string;

  @ApiPropertyOptional({ description: 'Similar to media ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  similarTo?: number;

  @ApiPropertyOptional({ description: 'Similar to media type', enum: ['anime', 'manga', 'game'] })
  @IsOptional()
  @IsIn(['anime', 'manga', 'game'])
  similarToType?: 'anime' | 'manga' | 'game';

  @ApiPropertyOptional({ description: 'Tags to include, comma-separated' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => sanitizeTagInput(value))
  tags?: string;

  @ApiPropertyOptional({ description: 'Platforms for games, comma-separated' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => sanitizeTagInput(value))
  platforms?: string;

  @ApiPropertyOptional({ description: 'Cache-busting timestamp' })
  @IsOptional()
  @Type(() => Number)
  _t?: number;
}

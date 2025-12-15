import { IsOptional, IsInt, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

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
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Filter by genre(s), comma-separated' })
  @IsOptional()
  @IsString()
  genres?: string;

  @ApiPropertyOptional({ description: 'Filter by genre (deprecated, use genres)' })
  @IsOptional()
  @IsString()
  genre?: string;

  @ApiPropertyOptional({ description: 'Similar to media ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  similarTo?: number;

  @ApiPropertyOptional({ description: 'Similar to media type', enum: ['anime', 'manga', 'game'] })
  @IsOptional()
  @IsString()
  similarToType?: 'anime' | 'manga' | 'game';

  @ApiPropertyOptional({ description: 'Tags to include, comma-separated' })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({ description: 'Platforms for games, comma-separated' })
  @IsOptional()
  @IsString()
  platforms?: string;

  @ApiPropertyOptional({ description: 'Cache-busting timestamp' })
  @IsOptional()
  @Type(() => Number)
  _t?: number;
}

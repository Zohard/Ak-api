import { IsOptional, IsString, IsNumber, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CollectionQueryDto {
  @ApiPropertyOptional({ example: 1, description: 'Page number for pagination' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, description: 'Number of items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'My Collection', description: 'Search term for collection name or description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 123, description: 'Filter by user ID' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  userId?: number;

  @ApiPropertyOptional({
    example: 'anime',
    description: 'Filter by media type',
    enum: ['anime', 'manga'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['anime', 'manga'])
  mediaType?: 'anime' | 'manga';

  @ApiPropertyOptional({
    example: 'watching',
    description: 'Filter by collection type',
    enum: ['watching', 'completed', 'on-hold', 'dropped', 'plan-to-watch'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['watching', 'completed', 'on-hold', 'dropped', 'plan-to-watch'])
  type?: string;

  @ApiPropertyOptional({ example: 'createdAt', description: 'Field to sort by', enum: ['name', 'createdAt', 'updatedAt', 'itemCount'] })
  @IsOptional()
  @IsString()
  @IsIn(['name', 'createdAt', 'updatedAt', 'itemCount'])
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ example: 'desc', description: 'Sort order', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
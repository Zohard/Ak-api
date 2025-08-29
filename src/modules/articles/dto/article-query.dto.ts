import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsIn,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ArticleQueryDto {
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

  @ApiPropertyOptional({ description: 'Search term for title and content' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value === '' ? undefined : value)
  search?: string;

  @ApiPropertyOptional({ description: 'Category ID to filter by' })
  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({ description: 'Author ID to filter by' })
  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  @Type(() => Number)
  @IsInt()
  authorId?: number;

  @ApiPropertyOptional({
    description: 'Article status',
    enum: ['all', 'published', 'draft', 'archived'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'published', 'draft', 'archived'])
  status?: string = 'published';

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['date', 'title', 'titre', 'views', 'nbClics', 'comments', 'commentCount'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['date', 'title', 'titre', 'views', 'nbClics', 'comments', 'commentCount'])
  sort?: string = 'date';

  @ApiPropertyOptional({
    description: 'Sort field (alias for sort)',
    enum: ['date', 'title', 'titre', 'views', 'nbClics', 'comments', 'commentCount'],
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsIn(['date', 'title', 'titre', 'views', 'nbClics', 'comments', 'commentCount'])
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'DESC';

  @ApiPropertyOptional({ 
    description: 'Sort order (alias for order)', 
    enum: ['ASC', 'DESC', 'asc', 'desc'] 
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  sortOrder?: string;

  @ApiPropertyOptional({ description: 'Filter articles shown on index page' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onindex?: boolean;

  @ApiPropertyOptional({ description: 'Filter by tag' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value === '' ? undefined : value)
  tag?: string;

  @ApiPropertyOptional({ description: 'Include article content in response' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeContent?: boolean = false;
}

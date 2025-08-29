import { IsOptional, IsString, IsInt, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ContentAdminQueryDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Search term for title or description',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['0', '1', 'all'],
  })
  @IsOptional()
  @IsIn(['0', '1', 'all'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Content type',
    enum: ['anime', 'manga', 'business', 'article'],
  })
  @IsOptional()
  @IsIn(['anime', 'manga', 'business', 'article'])
  type?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['id', 'titre', 'date_ajout', 'note_moyenne', 'nb_critiques'],
  })
  @IsOptional()
  @IsIn(['id', 'titre', 'date_ajout', 'note_moyenne', 'nb_critiques'])
  sort?: string = 'date_ajout';

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['ASC', 'DESC'],
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: string = 'DESC';
}

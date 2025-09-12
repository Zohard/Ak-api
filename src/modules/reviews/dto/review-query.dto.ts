import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class ReviewQueryDto {
  @ApiPropertyOptional({
    description: 'Numéro de page',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: "Nombre d'éléments par page",
    example: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Recherche dans le titre et contenu',
    example: 'magistral',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: "Filtrer par ID d'anime",
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  idAnime?: number;

  @ApiPropertyOptional({
    description: 'Filtrer par ID de manga',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  idManga?: number;

  @ApiPropertyOptional({
    description: 'Filtrer par ID de membre',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  idMembre?: number;

  @ApiPropertyOptional({
    description: 'Filtrer par pseudo de membre',
    example: 'JohnDoe',
  })
  @IsOptional()
  @IsString()
  pseudo?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par statut (0 = actif/visible, 1 = autre statut)',
    example: 0,
    minimum: 0,
    maximum: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  statut?: number;

  @ApiPropertyOptional({
    description: 'Note minimum',
    example: 7,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10)
  minNotation?: number;

  @ApiPropertyOptional({
    description: 'Champ pour le tri',
    example: 'dateCritique',
    enum: ['dateCritique', 'notation', 'popularite', 'nbClics'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['dateCritique', 'notation', 'popularite', 'nbClics'])
  sortBy?: string = 'dateCritique';

  @ApiPropertyOptional({
    description: 'Ordre du tri',
    example: 'desc',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    description: 'Type de critique',
    example: 'anime',
    enum: ['anime', 'manga', 'both'],
  })
  @IsOptional()
  @IsIn(['anime', 'manga', 'both'])
  type?: 'anime' | 'manga' | 'both';
}

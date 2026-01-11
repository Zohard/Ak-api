import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  IsIn,
  IsArray,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class AnimeQueryDto {
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
    description: 'Recherche par titre',
    example: 'naruto',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par studio',
    example: 'pierrot',
  })
  @IsOptional()
  @IsString()
  studio?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par année',
    example: 2023,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1900)
  annee?: number;

  @ApiPropertyOptional({
    description: 'Filtrer par année (alias de annee)',
    example: 2023,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1900)
  year?: number;

  @ApiPropertyOptional({
    description: 'Filtrer par statut (0 = en attente, 1 = validé, 2 = refusé)',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  statut?: number;

  @ApiPropertyOptional({
    description: 'Filtrer par fiche complète (0 = incomplète, 1 = complète)',
    example: 1,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  ficheComplete?: number;

  @ApiPropertyOptional({
    description: 'Filtrer par format',
    example: 'Série TV',
    enum: ['Série TV', 'Film', 'OAV', 'ONA', 'Clip', 'Spécial'],
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (!value) return undefined;
    // Decode URI component in case of encoding issues
    return decodeURIComponent(value.toString());
  })
  format?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par genre (un seul genre ou plusieurs séparés par des virgules)',
    example: 'Action',
    examples: {
      single: { value: 'Action', description: 'Un seul genre' },
      multiple: { value: 'Action,Romance,Comédie', description: 'Plusieurs genres séparés par des virgules' }
    }
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value || value === '') return undefined;
    // Handle comma-separated genres
    if (typeof value === 'string') {
      return value.split(',').map(g => g.trim()).filter(g => g !== '');
    }
    // Handle array (from multiple query params)
    if (Array.isArray(value)) {
      return value.filter(v => v && v !== '');
    }
    return undefined;
  })
  genre?: string[];

  @ApiPropertyOptional({
    description: 'Trier par',
    enum: ['dateAjout', 'titre', 'annee', 'moyenneNotes', 'classementPopularite'],
    example: 'dateAjout',
  })
  @IsOptional()
  @IsIn(['dateAjout', 'titre', 'annee', 'moyenneNotes', 'classementPopularite'])
  sortBy?: string = 'dateAjout';

  @ApiPropertyOptional({
    description: 'Ordre de tri',
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    description: 'Inclure les reviews',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  includeReviews?: boolean = false;

  @ApiPropertyOptional({
    description: 'Inclure les épisodes',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  includeEpisodes?: boolean = false;
}

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
    description: 'Filtrer par genre',
    example: 'Action',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value === '' ? undefined : value)
  genre?: string;

  @ApiPropertyOptional({
    description: 'Trier par',
    enum: ['dateAjout', 'titre', 'annee'],
    example: 'dateAjout',
  })
  @IsOptional()
  @IsIn(['dateAjout', 'titre', 'annee'])
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

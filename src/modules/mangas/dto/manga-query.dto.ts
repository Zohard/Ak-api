import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class MangaQueryDto {
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
    description: 'Recherche dans le titre et synopsis',
    example: 'One Piece',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par auteur',
    example: 'Eiichiro Oda',
  })
  @IsOptional()
  @IsString()
  auteur?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par année',
    example: '1997',
  })
  @IsOptional()
  @IsString()
  annee?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par statut (0 = en attente, 1 = validé, 2 = refusé)',
    example: 1,
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
    description: 'Filtrer par genre (un ou plusieurs, séparés par des virgules)',
    example: 'Action',
    examples: {
      single: { value: 'Action', description: 'Un seul genre' },
      multiple: { value: 'Action,Romance,Comédie', description: 'Plusieurs genres séparés par des virgules' },
    },
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value || value === '') return undefined;
    if (typeof value === 'string') {
      return value.split(',').map((g: string) => g.trim()).filter((g: string) => g !== '');
    }
    if (Array.isArray(value)) {
      return value.filter((v: string) => v && v !== '');
    }
    return undefined;
  })
  genre?: string[];

  @ApiPropertyOptional({
    description: 'Champ pour le tri',
    example: 'dateAjout',
    enum: ['titre', 'dateAjout', 'annee'],
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'dateAjout';

  @ApiPropertyOptional({
    description: 'Ordre du tri',
    example: 'desc',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    description: 'Inclure les critiques dans la réponse',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeReviews?: boolean = false;
}

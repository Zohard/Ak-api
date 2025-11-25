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

export class JeuVideoQueryDto {
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
    example: 'zelda',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par plateforme',
    example: 'Nintendo Switch',
  })
  @IsOptional()
  @IsString()
  plateforme?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par éditeur',
    example: 'Nintendo',
  })
  @IsOptional()
  @IsString()
  editeur?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par année',
    example: 2023,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1970)
  annee?: number;

  @ApiPropertyOptional({
    description: 'Filtrer par année (alias de annee)',
    example: 2023,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1970)
  year?: number;

  @ApiPropertyOptional({
    description: 'Filtrer par genre (plusieurs genres séparés par des virgules)',
    example: 'Action,Aventure',
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
    enum: ['dateAjout', 'titre', 'annee', 'moyenneNotes'],
    example: 'dateAjout',
  })
  @IsOptional()
  @IsIn(['dateAjout', 'titre', 'annee', 'moyenneNotes'])
  sortBy?: string = 'dateAjout';

  @ApiPropertyOptional({
    description: 'Ordre de tri',
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

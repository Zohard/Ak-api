import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  Min,
  Max,
  IsOptional,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReviewDto {
  @ApiProperty({
    description: 'Titre de la critique',
    example: 'Une critique constructive',
    minLength: 3,
  })
  @IsString()
  @MinLength(3, { message: 'Le titre doit contenir au moins 3 caractères' })
  titre: string;

  @ApiProperty({
    description: 'Contenu de la critique',
    example: 'Cette série est vraiment exceptionnelle grâce à...',
    minLength: 10,
  })
  @IsString()
  @MinLength(10, { message: 'Le contenu doit contenir au moins 10 caractères' })
  critique: string;

  @ApiProperty({
    description: 'Note sur 10',
    example: 8,
    minimum: 1,
    maximum: 10,
  })
  @IsInt({ message: 'La note doit être un nombre entier' })
  @Min(1, { message: 'La note doit être au minimum de 1' })
  @Max(10, { message: 'La note doit être au maximum de 10' })
  @Type(() => Number)
  notation: number;

  @ApiPropertyOptional({
    description: "ID de l'anime (requis si pas de mangaId ou jeuxVideoId)",
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @ValidateIf((o) => !o.idManga && !o.idJeu)
  idAnime?: number;

  @ApiPropertyOptional({
    description: "ID du manga (requis si pas d'animeId ou jeuxVideoId)",
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @ValidateIf((o) => !o.idAnime && !o.idJeu)
  idManga?: number;

  @ApiPropertyOptional({
    description: "ID du jeu vidéo (requis si pas d'animeId ou mangaId)",
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @ValidateIf((o) => !o.idAnime && !o.idManga)
  idJeu?: number;

  @ApiPropertyOptional({
    description: 'Afficher avec des illustrations/screenshots (0 ou 1)',
    example: 1,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  acceptImages?: number;
}

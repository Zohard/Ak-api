import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsUrl,
  IsArray,
} from 'class-validator';

export class CreateAnimeDto {
  @ApiProperty({
    description: "Titre de l'anime",
    example: 'Attack on Titan',
  })
  @IsString()
  titre: string;

  @ApiPropertyOptional({
    description: 'Titre original',
    example: 'Shingeki no Kyojin',
  })
  @IsOptional()
  @IsString()
  titreOrig?: string;

  @ApiPropertyOptional({
    description: 'Année de sortie',
    example: 2013,
  })
  @IsOptional()
  @IsNumber()
  @Min(1900)
  @Max(new Date().getFullYear() + 5)
  annee?: number;

  @ApiPropertyOptional({
    description: "Synopsis de l'anime",
    example: "Dans un monde où l'humanité vit retranchée...",
  })
  @IsOptional()
  @IsString()
  synopsis?: string;

  @ApiPropertyOptional({
    description: "URL de l'image de couverture",
    example: 'https://example.com/image.jpg',
  })
  @IsOptional()
  @IsUrl()
  image?: string;

  @ApiPropertyOptional({
    description: "Nombre d'épisodes",
    example: 25,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  nbEp?: number;

  @ApiPropertyOptional({
    description: "Studio d'animation",
    example: 'Studio Pierrot',
  })
  @IsOptional()
  @IsString()
  studio?: string;

  @ApiPropertyOptional({
    description: 'Réalisateur',
    example: 'Tetsuro Araki',
  })
  @IsOptional()
  @IsString()
  realisateur?: string;

  @ApiPropertyOptional({
    description: 'Statut (0 = en attente, 1 = validé, 2 = refusé)',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  statut?: number;
}

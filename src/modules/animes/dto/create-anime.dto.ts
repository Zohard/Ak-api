import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, Max, IsUrl } from 'class-validator';

export class CreateAnimeDto {
  @ApiProperty({
    description: "Titre de l'anime",
    example: 'Attack on Titan',
  })
  @IsString()
  titre: string;

  @ApiPropertyOptional({
    description: 'Slug SEO (nice URL)',
    example: 'attack-on-titan',
  })
  @IsOptional()
  @IsString()
  niceUrl?: string;

  @ApiPropertyOptional({
    description: 'Titre original',
    example: 'Shingeki no Kyojin',
  })
  @IsOptional()
  @IsString()
  titreOrig?: string;

  @ApiPropertyOptional({
    description: 'Titre français',
    example: 'L’Attaque des Titans',
  })
  @IsOptional()
  @IsString()
  titreFr?: string;

  @ApiPropertyOptional({
    description: 'Titres alternatifs',
    example: 'AoT\nShingeki',
  })
  @IsOptional()
  @IsString()
  titresAlternatifs?: string;

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
    description: "Champ libre pour nombre d'épisodes (legacy)",
    example: '12',
  })
  @IsOptional()
  @IsString()
  nbEpduree?: string;

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

  @ApiPropertyOptional({
    description: 'Format (ex: Série, Film)',
    example: 'Série',
  })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiPropertyOptional({
    description: 'Licence FR (legacy)',
    example: 0,
  })
  @IsOptional()
  @IsNumber()
  licence?: number;

  @ApiPropertyOptional({
    description: 'Site officiel',
    example: 'https://example.com',
  })
  @IsOptional()
  @IsString()
  officialSite?: string;

  @ApiPropertyOptional({
    description: 'Lien ADN',
    example: 'https://www.animationdigitalnetwork.fr/...',
  })
  @IsOptional()
  @IsString()
  lienAdn?: string;

  @ApiPropertyOptional({
    description: 'Doublage (texte libre)',
    example: 'Seiyuu A (Personnage X), Seiyuu B (Personnage Y)',
  })
  @IsOptional()
  @IsString()
  doublage?: string;

  @ApiPropertyOptional({
    description: 'Commentaire fiche (texte libre ou JSON legacy)',
    example: '{"ressources": []}',
  })
  @IsOptional()
  @IsString()
  commentaire?: string;
}

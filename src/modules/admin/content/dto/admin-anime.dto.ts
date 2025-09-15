import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAdminAnimeDto {
  @ApiProperty({ description: 'Titre de l\'anime' })
  @IsString()
  @IsNotEmpty()
  titre!: string;

  @ApiPropertyOptional({ description: 'Slug SEO (nice URL)' })
  @IsOptional()
  @IsString()
  niceUrl?: string;

  @ApiPropertyOptional({ description: 'Titre original' })
  @IsOptional()
  @IsString()
  titreOrig?: string;

  // Legacy compatibility: allow snake_case variant
  @ApiPropertyOptional({ description: 'Titre original (legacy: titre_orig)' })
  @IsOptional()
  @IsString()
  titre_orig?: string;

  @ApiPropertyOptional({ description: 'Année de sortie', minimum: 1900 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  annee?: number;

  @ApiPropertyOptional({ description: 'Nombre d\'épisodes', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  nbEp?: number;

  // Legacy compatibility: free-form episodes field like "12" or "12+" (will be parsed)
  @ApiPropertyOptional({ description: 'Nombre d\'épisodes (legacy: nb_epduree)' })
  @IsOptional()
  @IsString()
  nb_epduree?: string;

  // Accept camelCase variant from frontend
  @ApiPropertyOptional({ description: 'Nombre d\'épisodes (camelCase)' })
  @IsOptional()
  @IsString()
  nbEpduree?: string;

  @ApiPropertyOptional({ description: 'Studio d\'animation' })
  @IsOptional()
  @IsString()
  studio?: string;

  @ApiPropertyOptional({ description: 'Réalisateur' })
  @IsOptional()
  @IsString()
  realisateur?: string;

  @ApiPropertyOptional({ description: 'Synopsis' })
  @IsOptional()
  @IsString()
  synopsis?: string;

  @ApiPropertyOptional({ description: 'Nom de fichier image (uploads)' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ description: 'Statut', enum: [0, 1, 2], default: 0 })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1, 2])
  statut?: number;

  // Additional legacy fields accepted but not persisted (ignored server-side)
  @ApiPropertyOptional({ description: 'Format (legacy only)' })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiPropertyOptional({ description: 'Licence FR (legacy only)' })
  @IsOptional()
  @IsInt()
  licence?: number;

  @ApiPropertyOptional({ description: 'Titre français (legacy only)' })
  @IsOptional()
  @IsString()
  titre_fr?: string;

  @ApiPropertyOptional({ description: 'Titres alternatifs (legacy only)' })
  @IsOptional()
  @IsString()
  titres_alternatifs?: string;

  // Accept camelCase variant from frontend
  @ApiPropertyOptional({ description: 'Titres alternatifs (camelCase)' })
  @IsOptional()
  @IsString()
  titresAlternatifs?: string;

  @ApiPropertyOptional({ description: 'Site officiel (legacy only)' })
  @IsOptional()
  @IsString()
  official_site?: string;

  // Accept camelCase variant from frontend
  @ApiPropertyOptional({ description: 'Site officiel (camelCase)' })
  @IsOptional()
  @IsString()
  officialSite?: string;

  @ApiPropertyOptional({ description: 'Lien ADN (legacy only)' })
  @IsOptional()
  @IsString()
  lien_adn?: string;

  @ApiPropertyOptional({ description: 'Doublage (legacy only)' })
  @IsOptional()
  @IsString()
  doublage?: string;

  // `topic` removed. Use `commentaire` instead.

  @ApiPropertyOptional({ description: 'Commentaire fiche (legacy only)' })
  @IsOptional()
  @IsString()
  commentaire?: string;
}

export class UpdateAdminAnimeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  niceUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titreOrig?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1900)
  annee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  nbEp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  realisateur?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  synopsis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ enum: [0, 1, 2] })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1, 2])
  statut?: number;

  // Additional optional fields
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  format?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  licence?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titreFr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titresAlternatifs?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nbEpduree?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  officialSite?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lienAdn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  doublage?: string;

  // `topic` removed. Use `commentaire` instead.

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  commentaire?: string;
}

export class AdminAnimeListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Recherche dans le titre' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrer par année' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  annee?: number;

  @ApiPropertyOptional({ description: 'Filtrer par format' })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiPropertyOptional({ description: 'Filtrer par statut', enum: [0, 1, 2] })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2])
  statut?: number;

  @ApiPropertyOptional({ description: 'Champ de tri', enum: ['dateAjout', 'titre', 'annee'] })
  @IsOptional()
  @IsString()
  sortBy?: 'dateAjout' | 'titre' | 'annee' = 'dateAjout';

  @ApiPropertyOptional({ description: 'Ordre de tri', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsDateString, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAdminJeuxVideoDto {
  @ApiProperty({ description: 'Titre du jeu vidéo' })
  @IsString()
  @IsNotEmpty()
  titre!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  niceUrl?: string;

  @ApiPropertyOptional({ description: 'Legacy platform field (deprecated, use platformIds)' })
  @IsOptional()
  @IsString()
  plateforme?: string;

  @ApiPropertyOptional({ description: 'Array of platform IDs', type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  platformIds?: number[];

  @ApiPropertyOptional({ description: 'Legacy genre field (deprecated, use genreIds)' })
  @IsOptional()
  @IsString()
  genre?: string;

  @ApiPropertyOptional({ description: 'Array of genre IDs', type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  genreIds?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  editeur?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  annee?: number;

  @ApiPropertyOptional({ description: 'Date de sortie au Japon (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  dateSortieJapon?: string;

  @ApiPropertyOptional({ description: 'Date de sortie aux USA (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  dateSortieUsa?: string;

  @ApiPropertyOptional({ description: 'Date de sortie en Europe (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  dateSortieEurope?: string;

  @ApiPropertyOptional({ description: 'Date de sortie mondiale (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  dateSortieWorldwide?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  statut?: number;

  @ApiPropertyOptional({ description: 'IGDB game ID for future data fetching' })
  @IsOptional()
  @IsInt()
  igdbId?: number;
}

export class UpdateAdminJeuxVideoDto extends CreateAdminJeuxVideoDto {}

export class AdminJeuxVideoListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  statut?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  plateforme?: string;
}

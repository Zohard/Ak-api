import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsDateString } from 'class-validator';
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  plateforme?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genre?: string;

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

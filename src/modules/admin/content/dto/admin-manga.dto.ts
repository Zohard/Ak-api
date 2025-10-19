import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAdminMangaDto {
  @ApiProperty({ description: 'Titre du manga' })
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
  auteur?: string;

  @ApiPropertyOptional({ description: 'Année (string 4 chars)' })
  @IsOptional()
  @IsString()
  annee?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  origine?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titreOrig?: string;

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
  @IsInt()
  @Min(0)
  nbVol?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nbVolumes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  statutVol?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  editeur?: string;

  @ApiPropertyOptional({ description: 'ISBN du manga' })
  @IsOptional()
  @IsString()
  isbn?: string;

  @ApiPropertyOptional({ description: 'Précisions supplémentaires' })
  @IsOptional()
  @IsString()
  precisions?: string;

  @ApiPropertyOptional({ description: 'Statut de licence (0=non, 1=oui)', minimum: 0, maximum: 1 })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  licence?: number;

  @ApiPropertyOptional({ description: 'ID du lien forum associé', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  lienForum?: number;

  @ApiPropertyOptional({ description: 'Fiche complète (0=non, 1=oui)', minimum: 0, maximum: 1 })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  ficheComplete?: number;

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

  @ApiPropertyOptional({ description: 'Commentaire sur la fiche' })
  @IsOptional()
  @IsString()
  commentaire?: string;
}

export class UpdateAdminMangaDto extends CreateAdminMangaDto {}

export class AdminMangaListQueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Année (string 4 chars)' })
  @IsOptional()
  @IsString()
  annee?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  editeur?: string;

  @ApiPropertyOptional({ enum: [0, 1, 2] })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2])
  statut?: number;
}


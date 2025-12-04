import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsUrl,
  ValidateIf,
  Allow,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateMangaDto {
  @ApiProperty({
    description: 'Titre du manga',
    example: 'One Piece',
  })
  @IsString()
  titre: string;

  @ApiPropertyOptional({
    description: 'Année de sortie',
    example: '1997',
  })
  @IsOptional()
  @IsString()
  annee?: string;

  @ApiPropertyOptional({
    description: 'Synopsis du manga',
    example: "L'histoire de Monkey D. Luffy...",
  })
  @IsOptional()
  @IsString()
  synopsis?: string;

  @ApiPropertyOptional({
    description: "URL de l'image de couverture (can be null or empty string to clear)",
    example: 'https://example.com/image.jpg',
    nullable: true,
    type: 'string',
  })
  @Allow()
  @ValidateIf((o) => o.image && typeof o.image === 'string' && o.image.trim() !== '')
  @IsUrl({}, { message: 'Image must be a valid URL' })
  image?: string | null;

  @ApiPropertyOptional({
    description: 'Auteur du manga',
    example: 'Eiichiro Oda',
  })
  @IsOptional()
  @IsString()
  auteur?: string;

  @ApiPropertyOptional({
    description: 'Éditeur',
    example: 'Shueisha',
  })
  @IsOptional()
  @IsString()
  editeur?: string;

  @ApiPropertyOptional({
    description: 'Nombre de volumes',
    example: '105',
  })
  @IsOptional()
  @Transform(({ value }) => {
    // Convert number to string, or keep string as is
    if (value === null || value === undefined) return value;
    return String(value);
  })
  @IsString()
  nbVolumes?: string;

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
    description: 'Manga licencié en France (0 = Non, 1 = Oui)',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  licence?: number;

  @ApiPropertyOptional({
    description: 'Titre français (si licencié)',
    example: 'One Piece',
  })
  @IsOptional()
  @IsString()
  titreFr?: string;

  @ApiPropertyOptional({
    description: 'Pays d\'origine',
    example: 'Japon',
  })
  @IsOptional()
  @IsString()
  origine?: string;

  @ApiPropertyOptional({
    description: 'Titre original dans le pays d\'origine',
    example: 'ワンピース',
  })
  @IsOptional()
  @IsString()
  titreOrig?: string;

  @ApiPropertyOptional({
    description: 'Titres alternatifs (un par ligne)',
    example: 'ワンピース\nWan Pīsu',
  })
  @IsOptional()
  @IsString()
  titresAlternatifs?: string;

  @ApiPropertyOptional({
    description: 'Code ISBN-13 (pour artbooks et one-shots)',
    example: '978-4-08-870460-6',
  })
  @IsOptional()
  @IsString()
  isbn?: string;

  @ApiPropertyOptional({
    description: 'Commentaire public sur la fiche (BBCode autorisé)',
    example: 'La série compte 105+ volumes en cours de publication',
  })
  @IsOptional()
  @IsString()
  precisions?: string;
}

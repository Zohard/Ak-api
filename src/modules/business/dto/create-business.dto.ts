import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min, IsUrl } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBusinessDto {
  @ApiPropertyOptional({
    description: "URL SEO-friendly pour l'entité",
    example: 'studio-pierrot',
  })
  @IsOptional()
  @IsString()
  niceUrl?: string;

  @ApiProperty({
    description: "Type d'entité business",
    example: "Studio d'animation",
  })
  @IsString()
  type: string;

  @ApiProperty({
    description: "Dénomination de l'entité business",
    example: 'Studio Pierrot',
  })
  @IsString()
  denomination: string;

  @ApiPropertyOptional({
    description: 'Autres dénominations/noms alternatifs',
    example: 'Pierrot Co., Ltd.',
  })
  @IsOptional()
  @IsString()
  autresDenominations?: string;

  @ApiPropertyOptional({
    description: "URL de l'image/logo",
    example: 'https://example.com/pierrot-logo.jpg',
  })
  @IsOptional()
  @IsUrl()
  image?: string;

  @ApiPropertyOptional({
    description: 'Date de création/fondation',
    example: '1979',
  })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({
    description: "Pays d'origine",
    example: 'Japon',
  })
  @IsOptional()
  @IsString()
  origine?: string;

  @ApiPropertyOptional({
    description: 'Site officiel',
    example: 'https://pierrot.jp/',
  })
  @IsOptional()
  @IsUrl()
  siteOfficiel?: string;

  @ApiPropertyOptional({
    description: 'Notes supplémentaires',
    example:
      "Studio d'animation japonais fondé en 1979, célèbre pour Naruto et Bleach",
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Relations avec autres entités',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  relations?: number;

  @ApiPropertyOptional({
    description: 'Statut (0 = inactif, 1 = actif)',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  statut?: number;
}

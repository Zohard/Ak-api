import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsUrl,
} from 'class-validator';

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
    description: "URL de l'image de couverture",
    example: 'https://example.com/image.jpg',
  })
  @IsOptional()
  @IsUrl()
  image?: string;

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
}

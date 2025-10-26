import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, IsUrl, IsIn } from 'class-validator';

export class CreateTrailerDto {
  @ApiProperty({
    description: "ID de l'anime associé",
    example: 123,
  })
  @IsNumber()
  idAnime: number;

  @ApiProperty({
    description: "URL de la vidéo du trailer",
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })
  @IsUrl()
  url: string;

  @ApiPropertyOptional({
    description: 'Titre du trailer',
    example: 'PV1',
  })
  @IsOptional()
  @IsString()
  titre?: string;

  @ApiPropertyOptional({
    description: 'Plateforme vidéo (youtube, dailymotion, vimeo)',
    example: 'youtube',
  })
  @IsOptional()
  @IsString()
  @IsIn(['youtube', 'dailymotion', 'vimeo'])
  platform?: string;

  @ApiPropertyOptional({
    description: 'Code langue du trailer (ja, fr, en, etc.)',
    example: 'ja',
    default: 'ja',
  })
  @IsOptional()
  @IsString()
  langue?: string;

  @ApiPropertyOptional({
    description: 'Type de trailer (PV, Teaser, CM, Trailer)',
    example: 'PV',
    default: 'PV',
  })
  @IsOptional()
  @IsString()
  typeTrailer?: string;

  @ApiPropertyOptional({
    description: "Ordre d'affichage du trailer",
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  ordre?: number;

  @ApiPropertyOptional({
    description: 'Statut (0 = masqué, 1 = visible)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @IsIn([0, 1])
  statut?: number;
}

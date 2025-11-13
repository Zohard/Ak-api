import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, IsUrl, IsIn } from 'class-validator';

export class UpdateJeuVideoTrailerDto {
  @ApiPropertyOptional({
    description: 'URL de la vidéo du trailer',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })
  @IsOptional()
  @IsUrl()
  url?: string;

  @ApiPropertyOptional({
    description: 'Titre du trailer',
    example: 'Official Trailer',
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
    description: 'Code langue du trailer (en, fr, ja, etc.)',
    example: 'en',
  })
  @IsOptional()
  @IsString()
  langue?: string;

  @ApiPropertyOptional({
    description: 'Type de trailer',
    example: 'Trailer',
  })
  @IsOptional()
  @IsString()
  typeTrailer?: string;

  @ApiPropertyOptional({
    description: "Ordre d'affichage du trailer",
    example: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  ordre?: number;

  @ApiPropertyOptional({
    description: 'Statut (0 = masqué, 1 = visible)',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @IsIn([0, 1])
  statut?: number;
}

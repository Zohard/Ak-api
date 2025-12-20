import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ValidateSynopsisDto {
  @ApiPropertyOptional({
    description: 'Version éditée du synopsis (optionnel - si fourni, remplace le synopsis original)',
    example: 'Synopsis édité avec corrections de typos...'
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  editedSynopsis?: string;

  @ApiPropertyOptional({
    description: 'Nom d\'auteur personnalisé pour l\'attribution (optionnel - si non fourni, utilise l\'auteur original)',
    example: 'Équipe Modération'
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customAuthor?: string;
}

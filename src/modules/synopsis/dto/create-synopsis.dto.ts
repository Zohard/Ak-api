import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  MinLength,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSynopsisDto {
  @ApiProperty({
    description: 'Contenu du synopsis',
    example: 'Dans un monde post-apocalyptique, Eren Yeager et ses amis luttent contre les Titans pour la survie de l\'humanité...',
    minLength: 50,
    maxLength: 2000,
  })
  @IsString({ message: 'Le synopsis doit être une chaîne de caractères' })
  @MinLength(50, { message: 'Le synopsis doit contenir au moins 50 caractères' })
  @MaxLength(2000, { message: 'Le synopsis ne peut pas dépasser 2000 caractères' })
  synopsis: string;

  @ApiProperty({
    description: 'Type de média (1 = anime, 2 = manga)',
    example: 1,
    enum: [1, 2],
  })
  @IsInt({ message: 'Le type doit être un nombre entier' })
  @IsIn([1, 2], { message: 'Le type doit être 1 (anime) ou 2 (manga)' })
  @Type(() => Number)
  type: number;

  @ApiProperty({
    description: 'ID de la fiche (anime ou manga)',
    example: 123,
  })
  @IsInt({ message: 'L\'ID de la fiche doit être un nombre entier' })
  @Type(() => Number)
  id_fiche: number;
}
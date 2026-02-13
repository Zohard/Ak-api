import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class ResubmitSynopsisDto {
  @ApiProperty({
    description: 'Nouveau contenu du synopsis',
    minLength: 50,
    maxLength: 2000,
  })
  @IsString({ message: 'Le synopsis doit être une chaîne de caractères' })
  @MinLength(50, { message: 'Le synopsis doit contenir au moins 50 caractères' })
  @MaxLength(2000, { message: 'Le synopsis ne peut pas dépasser 2000 caractères' })
  synopsis: string;
}

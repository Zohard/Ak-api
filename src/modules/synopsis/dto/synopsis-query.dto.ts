import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class SynopsisQueryDto {
  @ApiPropertyOptional({
    description: 'Type de média (1 = anime, 2 = manga)',
    example: 1,
    enum: [1, 2],
  })
  @IsOptional()
  @IsInt({ message: 'Le type doit être un nombre entier' })
  @IsIn([1, 2], { message: 'Le type doit être 1 (anime) ou 2 (manga)' })
  @Type(() => Number)
  type?: number;

  @ApiPropertyOptional({
    description: 'ID de la fiche (anime ou manga)',
    example: 123,
  })
  @IsOptional()
  @IsInt({ message: 'L\'ID de la fiche doit être un nombre entier' })
  @Type(() => Number)
  id_fiche?: number;

  @ApiPropertyOptional({
    description: 'Statut de validation (0 = en attente, 1 = validé, 2 = rejeté)',
    example: 0,
    enum: [0, 1, 2],
  })
  @IsOptional()
  @IsInt({ message: 'La validation doit être un nombre entier' })
  @IsIn([0, 1, 2], { message: 'La validation doit être 0 (en attente), 1 (validé) ou 2 (rejeté)' })
  @Type(() => Number)
  validation?: number;
}
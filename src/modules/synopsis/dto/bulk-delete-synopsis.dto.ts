import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkDeleteSynopsisDto {
  @ApiProperty({
    description: 'Liste des IDs de synopsis à supprimer (max 100)',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray({ message: 'ids doit être un tableau' })
  @ArrayMinSize(1, { message: 'Au moins un ID est requis' })
  @ArrayMaxSize(100, { message: 'Maximum 100 IDs par requête' })
  @IsInt({ each: true, message: 'Chaque ID doit être un nombre entier' })
  @Type(() => Number)
  ids: number[];
}

import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class VoteDto {
  @ApiProperty({ description: 'ID du nominé' })
  @IsNumber()
  nomineeId: number;

  @ApiProperty({ description: 'ID de la catégorie' })
  @IsNumber()
  categoryId: number;
}

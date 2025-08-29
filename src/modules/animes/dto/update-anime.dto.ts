import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateAnimeDto } from './create-anime.dto';
import { IsOptional, IsNumber, Min, Max } from 'class-validator';

export class UpdateAnimeDto extends PartialType(CreateAnimeDto) {
  @ApiPropertyOptional({
    description: 'Note moyenne (calculée automatiquement)',
    example: 8.5,
    readOnly: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  note?: number;

  @ApiPropertyOptional({
    description: 'Nombre de votes (calculé automatiquement)',
    example: 150,
    readOnly: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  nbVotes?: number;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class BusinessSearchDto {
  @ApiProperty({
    description: 'Terme de recherche',
    example: 'pierrot',
    minLength: 1,
  })
  @IsString()
  q: string;

  @ApiPropertyOptional({
    description: 'Nombre maximum de résultats',
    example: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

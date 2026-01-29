import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, Max, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class BusinessQueryDto {
  @ApiPropertyOptional({
    description: 'Numéro de page',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: "Nombre d'éléments par page",
    example: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Filtrer par statut (0 = inactif, 1 = actif)',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  statut?: number;

  @ApiPropertyOptional({
    description: 'Terme de recherche pour dénomination',
    example: 'pierrot',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: "Filtrer par type d'entité",
    example: "Studio d'animation",
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    description: "Filtrer par pays d'origine",
    example: 'Japon',
  })
  @IsOptional()
  @IsString()
  origine?: string;

  @ApiPropertyOptional({
    description: "Filtrer par année de création",
    example: '2000',
  })
  @IsOptional()
  @IsString()
  year?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UserQueryDto {
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
    example: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: "Recherche par nom d'utilisateur ou nom réel",
    example: 'jean',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Trier par',
    enum: ['dateRegistered', 'lastLogin', 'posts', 'nbCritiques', 'memberName'],
    example: 'dateRegistered',
  })
  @IsOptional()
  @IsIn(['dateRegistered', 'lastLogin', 'posts', 'nbCritiques', 'memberName'])
  sortBy?: string = 'dateRegistered';

  @ApiPropertyOptional({
    description: 'Ordre de tri',
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAdminBusinessDto {
  @ApiProperty({ description: 'Dénomination' })
  @IsString()
  @IsNotEmpty()
  denomination!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  niceUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  autresDenominations?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ description: 'Date (free text)' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  origine?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((o) => o.siteOfficiel !== '' && o.siteOfficiel !== null)
  @IsUrl()
  siteOfficiel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Nombre de relations (-1 = non calculé)' })
  @IsOptional()
  @IsInt()
  relations?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  statut?: number;
}

export class UpdateAdminBusinessDto extends CreateAdminBusinessDto {}

export class AdminBusinessListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number = 1;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  statut?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;
  @ApiPropertyOptional({ default: 'dateAjout' })
  @IsOptional()
  @IsString()
  sortBy?: string;
  @ApiPropertyOptional({ default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}


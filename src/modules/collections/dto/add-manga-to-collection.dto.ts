import { IsNumber, IsString, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddMangaToCollectionDto {
  @ApiProperty({ example: 123, description: 'Manga ID to add to collection' })
  @IsNumber()
  mangaId: number;

  @ApiPropertyOptional({ example: 'Excellent manga with great artwork', description: 'Personal notes about this manga' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: 9.0, description: 'Personal rating for this manga (0-10)', minimum: 0, maximum: 10 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(10)
  rating?: number;

  @ApiPropertyOptional({ example: 45, description: 'Number of chapters read', minimum: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  nbChapitresLu?: number;
}
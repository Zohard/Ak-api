import { IsNumber, IsString, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddAnimeToCollectionDto {
  @ApiProperty({ example: 123, description: 'Anime ID to add to collection' })
  @IsNumber()
  animeId: number;

  @ApiPropertyOptional({ example: 'Great anime with amazing story', description: 'Personal notes about this anime' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: 8.5, description: 'Personal rating for this anime (0-10)', minimum: 0, maximum: 10 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(10)
  rating?: number;
}
import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ description: 'Category name', example: 'Anime Reviews' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  nom: string;

  @ApiPropertyOptional({
    description: 'URL-friendly slug',
    example: 'anime-reviews',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  niceUrl?: string;
}

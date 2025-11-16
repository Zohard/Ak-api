import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsISBN, IsDateString, Min } from 'class-validator';

export class CreateVolumeDto {
  @ApiProperty({ description: 'Volume number', example: 1 })
  @IsInt()
  @Min(1)
  volumeNumber: number;

  @ApiPropertyOptional({ description: 'ISBN-13', example: '9782756078519' })
  @IsOptional()
  @IsString()
  @IsISBN('13')
  isbn?: string;

  @ApiPropertyOptional({ description: 'Cover image path', example: 'images/mangas/vinland-saga-tome-1.jpg' })
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional({ description: 'Volume title', example: 'Tome 1' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Release date', example: '2020-01-15' })
  @IsOptional()
  @IsDateString()
  releaseDate?: string;

  @ApiPropertyOptional({ description: 'Volume description' })
  @IsOptional()
  @IsString()
  description?: string;
}

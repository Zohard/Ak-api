import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';

export class CreateGenreDto {
  @ApiProperty({ description: 'Genre name in English' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Genre name in French', required: false })
  @IsString()
  @IsOptional()
  nameFr?: string;

  @ApiProperty({ description: 'URL-friendly slug' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty({ description: 'Sort order for display', required: false, default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

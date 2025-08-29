import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsInt,
  Length,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateArticleDto {
  @ApiProperty({ description: 'Article title', maxLength: 255 })
  @IsString()
  @Length(1, 255)
  titre: string;

  @ApiPropertyOptional({ description: 'URL-friendly slug' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  niceUrl?: string;

  @ApiProperty({ description: 'Article content', type: 'string' })
  @IsString()
  texte: string;

  @ApiPropertyOptional({ description: 'Meta description for SEO' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @ApiPropertyOptional({ description: 'Article cover image URL' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  img?: string;

  @ApiPropertyOptional({ description: 'Additional authors (comma-separated)' })
  @IsOptional()
  @IsString()
  auteursMultiples?: string;

  @ApiPropertyOptional({ description: 'Article tags (comma-separated)' })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({ description: 'Video URLs (comma-separated)' })
  @IsOptional()
  @IsString()
  videos?: string;

  @ApiPropertyOptional({ description: 'Category IDs', type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  categoryIds?: number[];

  @ApiPropertyOptional({
    description: 'Content relationship IDs',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  contentIds?: number[];

  @ApiPropertyOptional({
    description: 'Content relationship types',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contentTypes?: string[];

  @ApiPropertyOptional({ description: 'Enable trackbacks', default: true })
  @IsOptional()
  @IsBoolean()
  trackbacksOpen?: boolean;

  @ApiPropertyOptional({ description: 'Show on index page', default: false })
  @IsOptional()
  @IsBoolean()
  onindex?: boolean;

  @ApiPropertyOptional({
    description: 'Convert newlines to breaks',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  nl2br?: boolean;
}

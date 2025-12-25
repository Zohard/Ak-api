import { IsInt, IsIn, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateArticleRelationDto {
  @ApiProperty({ description: 'Anime/Manga/Business ID' })
  @IsInt()
  @IsNotEmpty()
  @Type(() => Number)
  idFiche: number;

  @ApiProperty({ description: 'WordPress article ID' })
  @IsInt()
  @IsNotEmpty()
  @Type(() => Number)
  idWpArticle: number;

  @ApiProperty({
    description: 'Type of relation',
    enum: ['anime', 'manga', 'business'],
  })
  @IsIn(['anime', 'manga', 'business'])
  @IsNotEmpty()
  type: 'anime' | 'manga' | 'business';
}

export class DeleteArticleRelationDto {
  @ApiPropertyOptional({
    description: 'Type of relation (for updating modification date)',
    enum: ['anime', 'manga', 'business'],
  })
  @IsIn(['anime', 'manga', 'business'])
  @IsOptional()
  type?: 'anime' | 'manga' | 'business';
}

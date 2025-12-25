import { IsInt, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum MediaRelationType {
  ANIME = 'anime',
  MANGA = 'manga',
  GAME = 'game',
  BUSINESS = 'business',
  ARTICLE = 'article',
}

export class AddMediaRelationDto {
  @ApiProperty({
    description: 'Type of media being related',
    example: 'anime',
    enum: MediaRelationType,
  })
  @IsEnum(MediaRelationType)
  mediaType: MediaRelationType;

  @ApiProperty({
    description: 'ID of the related media',
    example: 1234,
  })
  @IsInt()
  mediaId: number;

  @ApiProperty({
    description: 'Type of relation (e.g., "Adaptation", "Spin-off", "Sequel")',
    example: 'Adaptation',
    required: false,
  })
  @IsOptional()
  @IsString()
  relationType?: string;

  @ApiProperty({
    description: 'Additional precision or notes about the relation',
    example: 'Adapté en anime en 2020',
    required: false,
  })
  @IsOptional()
  @IsString()
  precisions?: string;
}

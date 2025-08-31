import { IsNumber, IsString, IsOptional, Min, Max, IsIn, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class AddToCollectionDto {
  @ApiProperty({
    description: 'ID du média (anime ou manga)',
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  mediaId: number;

  @ApiProperty({
    description: 'Type de média',
    example: 'anime',
    enum: ['anime', 'manga'],
  })
  @IsString()
  @IsIn(['anime', 'manga'])
  mediaType: 'anime' | 'manga';

  @ApiProperty({
    description: 'Type de collection',
    example: 'watching',
    enum: ['watching', 'completed', 'on-hold', 'dropped', 'plan-to-watch'],
  })
  @IsString()
  @IsIn(['watching', 'completed', 'on-hold', 'dropped', 'plan-to-watch'])
  type: string;

  @ApiProperty({
    description: 'Note personnelle (1-5 étoiles)',
    example: 4,
    minimum: 1,
    maximum: 5,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  rating?: number;

  @ApiProperty({
    description: 'Notes personnelles',
    example: 'Excellent anime, très recommandé!',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

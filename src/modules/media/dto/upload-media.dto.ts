import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class UploadMediaDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Image file to upload',
  })
  file: Express.Multer.File;

  @ApiProperty({
    enum: ['anime', 'manga', 'avatar', 'cover'],
    description: 'Type of media content',
    example: 'anime',
  })
  @IsString()
  @IsIn(['anime', 'manga', 'avatar', 'cover'])
  type: 'anime' | 'manga' | 'avatar' | 'cover';

  @ApiProperty({
    description: 'Related content ID (anime, manga, etc.)',
    example: 1234,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  relatedId?: number;
}

export class BulkUploadDto {
  @ApiProperty({
    type: 'array',
    items: {
      type: 'string',
      format: 'binary',
    },
    description: 'Array of image files to upload',
  })
  files: Express.Multer.File[];

  @ApiProperty({
    enum: ['anime', 'manga', 'avatar', 'cover'],
    description: 'Type of media content for all files',
    example: 'anime',
  })
  @IsString()
  @IsIn(['anime', 'manga', 'avatar', 'cover'])
  type: 'anime' | 'manga' | 'avatar' | 'cover';
}

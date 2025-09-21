import { IsString, IsInt, IsOptional, IsArray, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ImportImageDto {
  @ApiProperty({
    description: 'Image URL to import from external source (will be uploaded to ImageKit)',
    example: 'https://example.com/image.jpg'
  })
  @IsString()
  @IsUrl()
  imageUrl: string;

  @ApiProperty({
    description: 'Custom filename for the image (optional)',
    example: 'custom-image-name',
    required: false
  })
  @IsOptional()
  @IsString()
  customFileName?: string;
}

export class ImportImageKitDto {
  @ApiProperty({
    description: 'ImageKit filename/path to associate with article',
    example: 'articles/image.jpg'
  })
  @IsString()
  imagePath: string;
}

export class BulkImportImagesDto {
  @ApiProperty({
    description: 'Array of image URLs to import from external sources',
    example: ['https://example.com/image1.jpg', 'https://example.com/image2.png']
  })
  @IsArray()
  @IsUrl({}, { each: true })
  imageUrls: string[];
}

export class BulkImportImageKitDto {
  @ApiProperty({
    description: 'Array of ImageKit filenames/paths to associate with article',
    example: ['articles/image1.jpg', 'articles/image2.png']
  })
  @IsArray()
  @IsString({ each: true })
  imagePaths: string[];
}
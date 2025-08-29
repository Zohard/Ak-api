import { IsArray, IsString, IsIn, ArrayNotEmpty, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkActionDto {
  @ApiProperty({
    description: 'Array of content IDs to perform action on',
    type: [Number],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  ids: number[];

  @ApiProperty({
    description: 'Action to perform',
    enum: ['activate', 'deactivate', 'delete', 'update_status'],
  })
  @IsString()
  @IsIn(['activate', 'deactivate', 'delete', 'update_status'])
  action: string;

  @ApiProperty({
    description: 'Content type',
    enum: ['anime', 'manga', 'business', 'article'],
  })
  @IsString()
  @IsIn(['anime', 'manga', 'business', 'article'])
  contentType: string;
}

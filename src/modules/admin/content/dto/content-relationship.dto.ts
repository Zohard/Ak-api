import { IsInt, IsString, IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContentRelationshipDto {
  @ApiProperty({
    description: 'ID of the related content',
  })
  @IsInt()
  related_id: number;

  @ApiProperty({
    description: 'Type of the related content',
    enum: ['anime', 'manga', 'jeu-video', 'article'],
  })
  @IsString()
  @IsIn(['anime', 'manga', 'jeu-video', 'article'])
  related_type: string;

  @ApiPropertyOptional({
    description: 'Type of relationship (currently ignored)',
    enum: [
      'sequel',
      'prequel',
      'side_story',
      'alternative_version',
      'adaptation',
      'other',
    ],
  })
  @IsOptional()
  @IsString()
  @IsIn([
    'sequel',
    'prequel',
    'side_story',
    'alternative_version',
    'adaptation',
    'other',
  ])
  relation_type?: string;

  @ApiPropertyOptional({
    description: 'Optional description of the relationship',
  })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateContentRelationshipDto {
  @ApiPropertyOptional({
    description: 'Type of relationship (currently ignored)',
    enum: [
      'sequel',
      'prequel',
      'side_story',
      'alternative_version',
      'adaptation',
      'other',
    ],
  })
  @IsOptional()
  @IsString()
  @IsIn([
    'sequel',
    'prequel',
    'side_story',
    'alternative_version',
    'adaptation',
    'other',
  ])
  relation_type?: string;

  @ApiPropertyOptional({
    description: 'Optional description of the relationship',
  })
  @IsOptional()
  @IsString()
  description?: string;
}

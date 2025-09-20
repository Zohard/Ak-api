import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ImportMalItemDto {
  @ApiProperty({ description: 'Media type', enum: ['anime', 'manga'] })
  @IsIn(['anime', 'manga'])
  type: 'anime' | 'manga';

  @ApiProperty({ description: 'Title from MAL entry' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'MAL status', enum: ['watching', 'completed', 'onhold', 'dropped', 'plantowatch', 'reading', 'plantoRead'] })
  @IsString()
  status: string;

  @ApiProperty({ description: 'MAL score 0-10', required: false })
  @IsOptional()
  @IsNumber()
  score?: number;

  @ApiProperty({ description: 'Progress (episodes/chapters consumed)', required: false })
  @IsOptional()
  @IsNumber()
  progress?: number;

  @ApiProperty({ description: 'MAL entry ID', required: false })
  @IsOptional()
  @IsNumber()
  malId?: number;
}

export class ImportMalDto {
  @ApiProperty({ type: [ImportMalItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportMalItemDto)
  items: ImportMalItemDto[];
}


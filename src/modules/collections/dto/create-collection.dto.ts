import { IsString, IsBoolean, IsOptional, MaxLength, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCollectionDto {
  @ApiProperty({ example: 'My Favorite Anime', description: 'Collection name' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'A collection of my favorite anime series', description: 'Collection description' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: true, description: 'Whether the collection is public', default: true })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean = true;

  @ApiPropertyOptional({ 
    example: 1, 
    description: 'Collection type (1=Plan to Watch, 2=Watching, 3=Completed, 4=Dropped)', 
    minimum: 1, 
    maximum: 4,
    default: 1 
  })
  @IsInt()
  @Min(1)
  @Max(4)
  @IsOptional()
  type?: number = 1;
}
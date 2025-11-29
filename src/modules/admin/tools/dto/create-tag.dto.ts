import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({ description: 'Tag name' })
  @IsString()
  @IsNotEmpty()
  tagName: string;

  @ApiProperty({ description: 'URL-friendly tag name', required: false })
  @IsString()
  @IsOptional()
  tagNiceUrl?: string;

  @ApiProperty({ description: 'Tag description', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Tag category', required: false })
  @IsString()
  @IsOptional()
  categorie?: string;
}

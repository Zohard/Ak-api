import {
  IsNotEmpty,
  IsString,
  IsInt,
  IsEmail,
  IsUrl,
  IsOptional,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({ description: 'Article ID to comment on' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  articleId: number;

  @ApiProperty({
    description: 'Comment content',
    example: 'Great article! Very informative.',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  commentaire: string;

  @ApiPropertyOptional({
    description: 'Commenter name (required for anonymous users)',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nom?: string;

  @ApiPropertyOptional({
    description: 'Commenter email (required for anonymous users)',
    example: 'john@example.com',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: 'Commenter website URL',
    example: 'https://example.com',
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(255)
  website?: string;
}

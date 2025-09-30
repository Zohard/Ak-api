import { IsString, IsNotEmpty, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePostDto {
  @ApiProperty({ description: 'Post subject', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  subject?: string;

  @ApiProperty({ description: 'Post body/content', example: 'Updated content' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  body: string;
}
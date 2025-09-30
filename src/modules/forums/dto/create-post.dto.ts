import { IsString, IsNotEmpty, IsInt, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePostDto {
  @ApiProperty({ description: 'Topic ID where the post will be added', example: 1 })
  @IsInt()
  @IsNotEmpty()
  topicId: number;

  @ApiProperty({ description: 'Post subject (optional, defaults to Re: topic subject)', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  subject?: string;

  @ApiProperty({ description: 'Post body/content', example: 'This is my reply' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  body: string;
}
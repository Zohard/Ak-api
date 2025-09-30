import { IsString, IsNotEmpty, IsInt, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTopicDto {
  @ApiProperty({ description: 'Board ID where the topic will be created', example: 1 })
  @IsInt()
  @IsNotEmpty()
  boardId: number;

  @ApiProperty({ description: 'Topic subject/title', example: 'My new topic' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  subject: string;

  @ApiProperty({ description: 'First message body', example: 'This is the first post content' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  body: string;
}
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

export class MoveTopicDto {
  @ApiProperty({
    description: 'Target board ID to move the topic to',
    example: 5,
    type: Number
  })
  @IsInt()
  @IsPositive()
  targetBoardId: number;
}

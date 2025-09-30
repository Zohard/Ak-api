import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class LockTopicDto {
  @ApiProperty({
    description: 'Lock status (true = locked, false = unlocked)',
    example: true,
    type: Boolean
  })
  @IsBoolean()
  locked: boolean;
}

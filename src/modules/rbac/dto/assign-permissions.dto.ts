import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt } from 'class-validator';

export class AssignPermissionsDto {
  @ApiProperty({
    type: [Number],
    example: [1, 2, 3, 4, 5],
    description: 'Array of permission IDs to assign to the role'
  })
  @IsArray()
  @IsInt({ each: true })
  permissionIds: number[];
}

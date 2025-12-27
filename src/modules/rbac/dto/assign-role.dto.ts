import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsBoolean, IsDateString } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({ description: 'User ID to assign the role to' })
  @IsInt()
  userId: number;

  @ApiProperty({ description: 'Role ID to assign' })
  @IsInt()
  roleId: number;

  @ApiProperty({ required: false, description: 'Optional expiration date for the role assignment' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiProperty({ default: true, description: 'Is the role assignment active?' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

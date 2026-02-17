import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsOptional, IsInt, Min, IsString, IsIn, IsBoolean } from 'class-validator';

export class StaffAkQueryDto {
  @ApiProperty({
    description: 'Page number for pagination',
    required: false,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    required: false,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiProperty({
    description: 'Search term to filter staff AK members by username, email, or display name',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Filter users without assigned roles',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  withoutRole?: boolean;

  @ApiProperty({
    description: 'Filter by SMF group ID',
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  groupId?: number;

  @ApiProperty({
    description: 'Field to sort by',
    required: false,
    default: 'user_registered',
    enum: ['ID', 'user_login', 'user_email', 'user_registered', 'display_name'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['ID', 'user_login', 'user_email', 'user_registered', 'display_name'])
  sort?: string = 'user_registered';

  @ApiProperty({
    description: 'Sort order',
    required: false,
    default: 'DESC',
    enum: ['ASC', 'DESC'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  order?: string = 'DESC';
}
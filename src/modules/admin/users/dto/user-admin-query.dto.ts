import { IsOptional, IsString, IsInt, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UserAdminQueryDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Search term for username, email, or display name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by user group',
    enum: ['administrator', 'moderator', 'premium', 'regular', 'banned'],
  })
  @IsOptional()
  @IsIn(['administrator', 'moderator', 'premium', 'regular', 'banned'])
  group?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: [
      'id_member',
      'member_name',
      'email_address',
      'date_registered',
      'last_login',
      'posts',
    ],
  })
  @IsOptional()
  @IsIn([
    'id_member',
    'member_name',
    'email_address',
    'date_registered',
    'last_login',
    'posts',
  ])
  sort?: string = 'date_registered';

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['ASC', 'DESC'],
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: string = 'DESC';
}

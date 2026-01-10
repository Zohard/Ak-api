import { IsString, IsOptional, IsNumber, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LogClientErrorDto {
  @ApiProperty({
    description: 'Error message',
    example: 'Failed to fetch: 502 Bad Gateway',
  })
  @IsString()
  message: string;

  @ApiPropertyOptional({
    description: 'Error stack trace',
    example: 'Error: Failed to fetch\n    at ...',
  })
  @IsString()
  @IsOptional()
  stack?: string;

  @ApiPropertyOptional({
    description: 'HTTP status code',
    example: 502,
  })
  @IsNumber()
  @IsOptional()
  statusCode?: number;

  @ApiPropertyOptional({
    description: 'API endpoint that failed',
    example: '/api/admin/dashboard',
  })
  @IsString()
  @IsOptional()
  endpoint?: string;

  @ApiPropertyOptional({
    description: 'Page URL where error occurred',
    example: 'https://anime-kun.com/admin',
  })
  @IsString()
  @IsOptional()
  url?: string;

  @ApiPropertyOptional({
    description: 'User agent string',
  })
  @IsString()
  @IsOptional()
  userAgent?: string;

  @ApiPropertyOptional({
    description: 'User ID if authenticated',
  })
  @IsNumber()
  @IsOptional()
  userId?: number;

  @ApiPropertyOptional({
    description: 'Additional context data',
  })
  @IsObject()
  @IsOptional()
  context?: Record<string, any>;
}

export class GetClientErrorsQueryDto {
  @ApiPropertyOptional({
    description: 'Number of errors to return',
    example: 100,
    default: 100,
  })
  @IsNumber()
  @IsOptional()
  limit?: number = 100;

  @ApiPropertyOptional({
    description: 'Filter by HTTP status code',
    example: 502,
  })
  @IsNumber()
  @IsOptional()
  statusCode?: number;

  @ApiPropertyOptional({
    description: 'Filter by endpoint',
    example: '/api/admin/dashboard',
  })
  @IsString()
  @IsOptional()
  endpoint?: string;
}

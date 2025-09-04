import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GatewayRouteDto {
  @ApiProperty({ description: 'Route path pattern' })
  @IsString()
  path: string;

  @ApiProperty({ description: 'HTTP method or ALL' })
  @IsString()
  method: string;

  @ApiProperty({ description: 'Target service name' })
  @IsString()
  target: string;

  @ApiProperty({ description: 'Rate limit window in milliseconds', required: false })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  windowMs?: number;

  @ApiProperty({ description: 'Max requests per window', required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10000)
  maxRequests?: number;

  @ApiProperty({ description: 'Requires authentication', required: false })
  @IsOptional()
  @IsBoolean()
  auth?: boolean;

  @ApiProperty({ description: 'Required roles', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}

export class CreateGatewayRouteDto extends GatewayRouteDto {}

export class UpdateGatewayRouteDto {
  @ApiProperty({ description: 'Target service name', required: false })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiProperty({ description: 'Rate limit window in milliseconds', required: false })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  windowMs?: number;

  @ApiProperty({ description: 'Max requests per window', required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10000)
  maxRequests?: number;

  @ApiProperty({ description: 'Requires authentication', required: false })
  @IsOptional()
  @IsBoolean()
  auth?: boolean;

  @ApiProperty({ description: 'Required roles', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}
import { IsNumber, IsString, IsOptional, Min, Max, IsBoolean, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddJeuxVideoToCollectionDto {
  @ApiProperty({ example: 123, description: 'Video game ID to add to collection' })
  @IsNumber()
  gameId: number;

  @ApiProperty({ example: 1, description: 'Collection type: 1=Terminé, 2=En cours, 3=Planifié, 4=Abandonné, 5=En pause', minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  type: number;

  @ApiPropertyOptional({ example: 'Great game with amazing story', description: 'Personal notes about this game' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: 8.5, description: 'Personal rating for this game (0-10)', minimum: 0, maximum: 10 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(10)
  rating?: number;

  @ApiPropertyOptional({ example: 'PlayStation 5', description: 'Platform played on' })
  @IsString()
  @IsOptional()
  platformPlayed?: string;

  @ApiPropertyOptional({ example: 'PlayStation 5', description: 'Physical platform owned' })
  @IsString()
  @IsOptional()
  physicalPlatform?: string;

  @ApiPropertyOptional({ example: '2024-01-15', description: 'Date started playing' })
  @IsDateString()
  @IsOptional()
  startedDate?: string;

  @ApiPropertyOptional({ example: '2024-02-20', description: 'Date finished playing' })
  @IsDateString()
  @IsOptional()
  finishedDate?: string;

  @ApiPropertyOptional({ example: true, description: 'Whether this game is liked' })
  @IsBoolean()
  @IsOptional()
  liked?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Whether this game is mastered (100% completion)' })
  @IsBoolean()
  @IsOptional()
  mastered?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Whether this is a replay' })
  @IsBoolean()
  @IsOptional()
  isReplay?: boolean;

  @ApiPropertyOptional({ example: 'My first playthrough', description: 'Log title' })
  @IsString()
  @IsOptional()
  logTitle?: string;

  @ApiPropertyOptional({ example: 25, description: 'Hours played' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  timePlayedHours?: number;

  @ApiPropertyOptional({ example: 30, description: 'Minutes played' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(59)
  timePlayedMinutes?: number;

  @ApiPropertyOptional({ example: 'Physical', description: 'Ownership type (Physical, Digital, Subscription)' })
  @IsString()
  @IsOptional()
  ownershipType?: string;

  @ApiPropertyOptional({ example: 'Steam', description: 'Digital storefront' })
  @IsString()
  @IsOptional()
  storefront?: string;

  @ApiPropertyOptional({ example: false, description: 'Whether notes contain spoilers' })
  @IsBoolean()
  @IsOptional()
  containsSpoilers?: boolean;
}

import {
  IsNotEmpty,
  IsString,
  IsIn,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ModerateReviewDto {
  @ApiProperty({
    description: 'Moderation action',
    enum: ['approve', 'reject'],
  })
  @IsNotEmpty()
  @IsString()
  @IsIn(['approve', 'reject'])
  action: string;

  @ApiPropertyOptional({
    description: 'Reason for moderation action (required for rejection)',
    example: 'Contenu inapproprié ou non conforme aux règles de la communauté',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

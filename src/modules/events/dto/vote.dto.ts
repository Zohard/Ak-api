import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class VoteDto {
  @ApiProperty({ description: 'ID du nominé' })
  @IsNumber()
  nomineeId: number;

  @ApiProperty({ description: 'ID de la catégorie' })
  @IsNumber()
  categoryId: number;

  @ApiPropertyOptional({ description: 'Token anonyme (UUID stocké en localStorage pour les non-connectés)' })
  @IsOptional()
  @IsString()
  anonToken?: string;

  @ApiPropertyOptional({ description: 'Token reCAPTCHA v3 (requis pour les votes anonymes)' })
  @IsOptional()
  @IsString()
  recaptchaToken?: string;
}

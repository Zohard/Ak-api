import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, MaxLength, IsIn } from 'class-validator';

export class CreateReviewReportDto {
  @ApiProperty({
    description: 'ID de la critique à signaler',
    example: 123,
  })
  @IsInt({ message: 'L\'ID de la critique doit être un nombre entier' })
  id_critique: number;

  @ApiProperty({
    description: 'Raison du signalement',
    example: 'spam',
    enum: ['spam', 'offensive', 'inappropriate', 'spoiler', 'fake', 'other'],
  })
  @IsString({ message: 'La raison doit être une chaîne de caractères' })
  @IsIn(['spam', 'offensive', 'inappropriate', 'spoiler', 'fake', 'other'], {
    message: 'Raison invalide',
  })
  reason: string;

  @ApiProperty({
    description: 'Commentaire optionnel sur le signalement',
    example: 'Cette critique contient des spoilers non marqués',
    required: false,
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'Le commentaire doit être une chaîne de caractères' })
  @MaxLength(500, { message: 'Le commentaire ne peut pas dépasser 500 caractères' })
  comment?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsOptional,
  MinLength,
  IsUrl,
  IsDateString,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: "Nom réel de l'utilisateur",
    example: 'Jean Dupont',
  })
  @IsOptional()
  @IsString()
  realName?: string;

  @ApiPropertyOptional({
    description: 'Adresse email',
    example: 'jean@example.com',
  })
  @IsOptional()
  @IsEmail({}, { message: "Format d'email invalide" })
  email?: string;

  @ApiPropertyOptional({
    description: 'Texte personnel/bio',
    example: "Passionné d'anime depuis 20 ans",
  })
  @IsOptional()
  @IsString()
  personalText?: string;

  @ApiPropertyOptional({
    description: 'Signature du forum',
    example: 'Mes animes préférés: One Piece, Naruto...',
  })
  @IsOptional()
  @IsString()
  signature?: string;

  @ApiPropertyOptional({
    description: 'Localisation',
    example: 'Paris, France',
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    description: 'Titre du site web',
    example: 'Mon blog anime',
  })
  @IsOptional()
  @IsString()
  websiteTitle?: string;

  @ApiPropertyOptional({
    description: 'URL du site web',
    example: 'https://monblog.com',
  })
  @IsOptional()
  @IsUrl({}, { message: 'URL invalide' })
  websiteUrl?: string;

  @ApiPropertyOptional({
    description: 'Date de naissance (YYYY-MM-DD)',
    example: '1990-01-15',
  })
  @IsOptional()
  @IsDateString()
  birthdate?: string;

  @ApiPropertyOptional({
    description: 'Mot de passe actuel (requis pour changer email/mot de passe)',
  })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiPropertyOptional({
    description: 'Nouveau mot de passe',
    minLength: 6,
  })
  @IsOptional()
  @IsString()
  @MinLength(6, {
    message: 'Le mot de passe doit contenir au moins 6 caractères',
  })
  newPassword?: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: "Nom d'utilisateur",
    example: 'johndoe',
    minLength: 3,
  })
  @IsString()
  @MinLength(3, {
    message: "Le nom d'utilisateur doit contenir au moins 3 caractères",
  })
  username: string;

  @ApiProperty({
    description: 'Adresse email',
    example: 'john@example.com',
  })
  @IsEmail({}, { message: 'Email invalide' })
  email: string;

  @ApiProperty({
    description: 'Mot de passe',
    example: 'motdepasse123',
    minLength: 6,
  })
  @IsString()
  @MinLength(6, {
    message: 'Le mot de passe doit contenir au moins 6 caractères',
  })
  password: string;

  @ApiProperty({
    description: 'Nom réel (optionnel)',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  realName?: string;

  @ApiProperty({
    description: 'Token de validation reCAPTCHA',
    example: '03AGdBq25...',
  })
  @IsString()
  captchaToken: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsNumber,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: "Nom d'utilisateur",
    example: 'johndoe',
    minLength: 3,
  })
  @IsString()
  @MinLength(3, {
    message: "Le nom d'utilisateur doit contenir au moins 3 caractères",
  })
  memberName: string;

  @ApiProperty({
    description: 'Adresse email',
    example: 'john@example.com',
  })
  @IsEmail({}, { message: "Format d'email invalide" })
  emailAddress: string;

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

  @ApiPropertyOptional({
    description: 'Nom réel',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  realName?: string;

  @ApiPropertyOptional({
    description: "Groupe d'utilisateur (0 = membre normal, 1 = admin)",
    example: 0,
  })
  @IsOptional()
  @IsNumber()
  idGroup?: number;
}

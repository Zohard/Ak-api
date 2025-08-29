import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Token de réinitialisation',
    example: 'abc123def456...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Token de réinitialisation requis' })
  token: string;

  @ApiProperty({
    description: 'Nouveau mot de passe',
    example: 'nouveaumotdepasse123',
    minLength: 6,
  })
  @IsString()
  @MinLength(6, {
    message: 'Le nouveau mot de passe doit contenir au moins 6 caractères',
  })
  newPassword: string;
}

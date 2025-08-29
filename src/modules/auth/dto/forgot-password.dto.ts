import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: "Adresse email de l'utilisateur",
    example: 'john@example.com',
  })
  @IsEmail({}, { message: "Format d'email invalide" })
  email: string;
}

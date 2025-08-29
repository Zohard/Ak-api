import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: "Nom d'utilisateur ou adresse email",
    example: 'johndoe',
  })
  @IsString()
  @IsNotEmpty({ message: "Email ou nom d'utilisateur requis" })
  emailOrUsername: string;

  @ApiProperty({
    description: 'Mot de passe',
    example: 'motdepasse123',
  })
  @IsString()
  @IsNotEmpty({ message: 'Mot de passe requis' })
  password: string;
}

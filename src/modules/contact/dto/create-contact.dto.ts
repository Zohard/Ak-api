import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateContactDto {
  @ApiProperty({ description: 'Nom de l\'expéditeur', example: 'John Doe' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ description: 'Email de l\'expéditeur', example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Message', example: 'Bonjour, j\'ai une question...' })
  @IsString()
  @MinLength(10)
  message: string;
}

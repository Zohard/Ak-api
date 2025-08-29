import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Token de rafraîchissement',
    example: 'abc123def456...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Token de rafraîchissement requis' })
  refreshToken: string;
}

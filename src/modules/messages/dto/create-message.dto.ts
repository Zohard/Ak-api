import { IsNotEmpty, IsString, IsInt, IsOptional, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMessageDto {
  @IsInt()
  @Type(() => Number)
  @IsNotEmpty()
  senderId: number;

  @IsInt()
  @Type(() => Number)
  @IsNotEmpty()
  recipientId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  threadId?: number;
}
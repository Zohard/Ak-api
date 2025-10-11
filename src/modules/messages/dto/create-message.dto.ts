import { IsNotEmpty, IsString, IsInt, IsOptional, MaxLength, IsArray } from 'class-validator';
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

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  bccRecipientIds?: number[];
}
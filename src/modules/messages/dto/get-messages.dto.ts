import { IsOptional, IsString, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class GetMessagesDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  userId?: number;

  @IsOptional()
  @IsString()
  @IsIn(['inbox', 'sent'])
  type?: 'inbox' | 'sent' = 'inbox';

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  offset?: number = 0;
}

export class SearchMessagesDto {
  @IsInt()
  @Type(() => Number)
  userId: number;

  @IsString()
  searchTerm: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  offset?: number = 0;
}

export class MarkReadDto {
  @IsInt()
  @Type(() => Number)
  messageId: number;

  @IsInt()
  @Type(() => Number)
  userId: number;
}
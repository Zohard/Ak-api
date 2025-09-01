import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateItemsDto {
  @IsArray()
  items: string[]; // IDs as strings

  @IsOptional()
  @IsArray()
  comments?: string[]; // optional comments aligned with items
}


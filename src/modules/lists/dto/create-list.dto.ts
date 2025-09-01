import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateListDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  titre: string;

  @IsString()
  @IsOptional()
  presentation?: string;

  @IsString()
  @IsIn(['liste', 'top'])
  type: 'liste' | 'top';

  @IsString()
  @IsIn(['anime', 'manga'])
  animeOrManga: 'anime' | 'manga';

  @IsOptional()
  @IsString()
  jsonData?: string; // JSON string of IDs

  @IsOptional()
  @IsString()
  jsonDataCom?: string; // JSON string of comments aligned with items

  @IsOptional()
  @IsInt()
  statut?: number; // 0 draft, 1 published
}


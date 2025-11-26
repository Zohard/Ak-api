import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsBoolean, IsDateString, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export enum MediaType {
  ANIME = 'anime',
  MANGA = 'manga',
  GAME = 'game',
  MIXED = 'mixed',
}

export enum EventType {
  AWARDS = 'awards',
  SELECTION = 'selection',
  POLL = 'poll',
}

export enum EventStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  VOTING = 'voting',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
}

export class CreateNomineeDto {
  @ApiPropertyOptional({ description: 'ID anime' })
  @IsOptional()
  @IsNumber()
  animeId?: number;

  @ApiPropertyOptional({ description: 'ID manga' })
  @IsOptional()
  @IsNumber()
  mangaId?: number;

  @ApiPropertyOptional({ description: 'ID jeu video' })
  @IsOptional()
  @IsNumber()
  gameId?: number;

  @ApiPropertyOptional({ description: 'Titre personnalisé' })
  @IsOptional()
  @IsString()
  customTitle?: string;

  @ApiPropertyOptional({ description: 'Image personnalisée' })
  @IsOptional()
  @IsString()
  customImage?: string;

  @ApiPropertyOptional({ description: 'Description personnalisée' })
  @IsOptional()
  @IsString()
  customDescription?: string;

  @ApiPropertyOptional({ description: 'Position' })
  @IsOptional()
  @IsNumber()
  position?: number;
}

export class CreateCategoryDto {
  @ApiProperty({ description: 'Nom de la catégorie' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Position' })
  @IsOptional()
  @IsNumber()
  position?: number;

  @ApiPropertyOptional({ description: 'Nombre max de votes par utilisateur', default: 1 })
  @IsOptional()
  @IsNumber()
  maxVotes?: number;

  @ApiPropertyOptional({ description: 'Nominés', type: [CreateNomineeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateNomineeDto)
  nominees?: CreateNomineeDto[];
}

export class CreateEventDto {
  @ApiProperty({ description: 'Titre de l\'événement' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Image de bannière' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ description: 'Année pour filtrer les nominés' })
  @IsOptional()
  @IsNumber()
  year?: number;

  @ApiPropertyOptional({ description: 'ID du sujet de forum associé' })
  @IsOptional()
  @IsNumber()
  topicId?: number;

  @ApiPropertyOptional({ description: 'Type de média', enum: MediaType, default: MediaType.MIXED })
  @IsOptional()
  @IsEnum(MediaType)
  mediaType?: MediaType;

  @ApiPropertyOptional({ description: 'Type d\'événement', enum: EventType, default: EventType.AWARDS })
  @IsOptional()
  @IsEnum(EventType)
  eventType?: EventType;

  @ApiPropertyOptional({ description: 'Date de début des votes' })
  @IsOptional()
  @IsDateString()
  votingStart?: string;

  @ApiPropertyOptional({ description: 'Date de fin des votes' })
  @IsOptional()
  @IsDateString()
  votingEnd?: string;

  @ApiPropertyOptional({ description: 'Résultats visibles', default: false })
  @IsOptional()
  @IsBoolean()
  resultsVisible?: boolean;

  @ApiPropertyOptional({ description: 'Notifier les utilisateurs', default: true })
  @IsOptional()
  @IsBoolean()
  notifyUsers?: boolean;

  @ApiPropertyOptional({ description: 'Catégories', type: [CreateCategoryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCategoryDto)
  categories?: CreateCategoryDto[];
}

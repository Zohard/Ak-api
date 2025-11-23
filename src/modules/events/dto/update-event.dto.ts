import { PartialType } from '@nestjs/swagger';
import { CreateEventDto } from './create-event.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import { EventStatus } from './create-event.dto';

export class UpdateEventDto extends PartialType(CreateEventDto) {
  @ApiPropertyOptional({ description: 'Statut de l\'événement', enum: EventStatus })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;
}

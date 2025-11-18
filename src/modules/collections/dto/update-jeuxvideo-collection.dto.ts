import { PartialType } from '@nestjs/swagger';
import { AddJeuxVideoToCollectionDto } from './add-jeuxvideo-to-collection.dto';
import { OmitType } from '@nestjs/swagger';

// Omit gameId since we're updating an existing entry
export class UpdateJeuxVideoCollectionDto extends PartialType(
  OmitType(AddJeuxVideoToCollectionDto, ['gameId'] as const)
) {}

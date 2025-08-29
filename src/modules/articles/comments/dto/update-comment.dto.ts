import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateCommentDto } from './create-comment.dto';

export class UpdateCommentDto extends PartialType(
  OmitType(CreateCommentDto, ['articleId'] as const),
) {}

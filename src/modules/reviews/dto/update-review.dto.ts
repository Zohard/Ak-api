import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateReviewDto } from './create-review.dto';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateReviewDto extends PartialType(CreateReviewDto) {
  @ApiPropertyOptional({
    description: 'Statut (0 = en attente, 1 = validé, 2 = refusé)',
    example: 0,
    minimum: 0,
    maximum: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2)
  @Type(() => Number)
  statut?: number;
}

import { IsOptional, IsBoolean, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PublishArticleDto {
  @ApiPropertyOptional({ description: 'Publish the article', default: true })
  @IsOptional()
  @IsBoolean()
  publish?: boolean = true;

  @ApiPropertyOptional({ description: 'Schedule publication date' })
  @IsOptional()
  @IsDateString()
  publishDate?: string;

  @ApiPropertyOptional({ description: 'Show article on index page' })
  @IsOptional()
  @IsBoolean()
  onindex?: boolean;
}

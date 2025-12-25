import { Module } from '@nestjs/common';
import { ArticleRelationsController } from './article-relations.controller';
import { ArticleRelationsService } from './article-relations.service';

@Module({
  controllers: [ArticleRelationsController],
  providers: [ArticleRelationsService],
  exports: [ArticleRelationsService],
})
export class ArticleRelationsModule {}

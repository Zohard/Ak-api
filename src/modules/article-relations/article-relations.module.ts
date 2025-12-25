import { Module } from '@nestjs/common';
import { ArticleRelationsController } from './article-relations.controller';
import { ArticleRelationsService } from './article-relations.service';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [ArticleRelationsController],
  providers: [ArticleRelationsService, PrismaService],
  exports: [ArticleRelationsService],
})
export class ArticleRelationsModule {}

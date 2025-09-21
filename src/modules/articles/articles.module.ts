import { Module } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { AdminArticlesController } from './admin/admin-articles.controller';
import { CategoriesService } from './categories/categories.service';
import { CategoriesController } from './categories/categories.controller';
import { AdminCategoriesController } from './categories/admin/admin-categories.controller';
import { CommentsService } from './comments/comments.service';
import { CommentsController } from './comments/comments.controller';
import { AdminCommentsController } from './comments/admin/admin-comments.controller';
import { ArticlePermissionsGuard } from './guards/article-permissions.guard';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [MediaModule],
  controllers: [
    ArticlesController,
    AdminArticlesController,
    CategoriesController,
    AdminCategoriesController,
    CommentsController,
    AdminCommentsController,
  ],
  providers: [
    ArticlesService,
    CategoriesService,
    CommentsService,
    ArticlePermissionsGuard,
    PrismaService,
    CacheService,
  ],
  exports: [ArticlesService, CategoriesService, CommentsService],
})
export class ArticlesModule {
  // Phase 8.1 - Articles System
  // Phase 8.2 - Categories & Comments System
}

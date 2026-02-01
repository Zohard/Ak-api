import { Module } from '@nestjs/common';
import { HomePageController } from './homepage.controller';
import { HomePageService } from './homepage.service';
import { MobileHomePageService } from './mobile-homepage.service';
import { CacheService } from '../../shared/services/cache.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { ReviewsModule } from '../reviews/reviews.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { ForumsModule } from '../forums/forums.module';
import { ArticlesModule } from '../articles/articles.module';
import { AnimesModule } from '../animes/animes.module';

@Module({
  imports: [ReviewsModule, SeasonsModule, ForumsModule, ArticlesModule, AnimesModule],
  controllers: [HomePageController],
  providers: [HomePageService, MobileHomePageService, CacheService, PrismaService],
})
export class HomePageModule {}


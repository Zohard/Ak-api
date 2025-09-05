import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { PopularityService } from '../../shared/services/popularity.service';

@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService, PrismaService, CacheService, PopularityService],
  exports: [ReviewsService],
})
export class ReviewsModule {}

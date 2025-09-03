import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService, PrismaService, CacheService],
  exports: [ReviewsService],
})
export class ReviewsModule {}

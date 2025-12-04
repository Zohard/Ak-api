import { Module } from '@nestjs/common';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

@Module({
  controllers: [RecommendationsController],
  providers: [RecommendationsService, PrismaService, CacheService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}

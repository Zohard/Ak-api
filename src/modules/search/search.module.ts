import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { UnifiedSearchService } from '../../shared/services/unified-search.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

@Module({
  controllers: [SearchController],
  providers: [UnifiedSearchService, PrismaService, CacheService],
  exports: [UnifiedSearchService],
})
export class SearchModule {}

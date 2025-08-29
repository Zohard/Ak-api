import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { UnifiedSearchService } from '../../shared/services/unified-search.service';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [SearchController],
  providers: [UnifiedSearchService, PrismaService],
  exports: [UnifiedSearchService],
})
export class SearchModule {}

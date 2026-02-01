import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CollectionsService } from './collections.service';
import { CollectionsController } from './collections.controller';
import { ImportProcessor } from './processors/import.processor';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { EmailService } from '../../shared/services/email.service';
import { JikanService } from '../jikan/jikan.service';
import { VideoGameCollectionService } from './services/video-game-collection.service';
import { CollectionStatisticsService } from './services/collection-statistics.service';
import { CollectionImportService } from './services/collection-import.service';
import { CollectionBrowseService } from './services/collection-browse.service';
import { RecommendationsModule } from '../recommendations/recommendations.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'import-queue',
    }),
    forwardRef(() => RecommendationsModule),
  ],
  controllers: [CollectionsController],
  providers: [
    CollectionsService,
    ImportProcessor,
    PrismaService,
    CacheService,
    EmailService,
    JikanService,
    VideoGameCollectionService,
    CollectionStatisticsService,
    CollectionImportService,
    CollectionBrowseService,
  ],
  exports: [
    CollectionsService,
    VideoGameCollectionService,
    CollectionStatisticsService,
    CollectionImportService,
    CollectionBrowseService,
  ],
})
export class CollectionsModule { }
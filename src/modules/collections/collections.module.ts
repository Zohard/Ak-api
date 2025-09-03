import { Module } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { CollectionsController } from './collections.controller';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

@Module({
  controllers: [CollectionsController],
  providers: [CollectionsService, PrismaService, CacheService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
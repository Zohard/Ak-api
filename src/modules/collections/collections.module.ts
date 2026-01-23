import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CollectionsService } from './collections.service';
import { CollectionsController } from './collections.controller';
import { ImportProcessor } from './import.processor';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { EmailService } from '../../shared/services/email.service';
import { JikanService } from '../jikan/jikan.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'import-queue',
    }),
  ],
  controllers: [CollectionsController],
  providers: [CollectionsService, ImportProcessor, PrismaService, CacheService, EmailService, JikanService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
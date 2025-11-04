import { Module } from '@nestjs/common';
import { AnimesService } from './animes.service';
import { AnimesController } from './animes.controller';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { MediaModule } from '../media/media.module';
import { AniListModule } from '../anilist/anilist.module';
import { AdminLoggingModule } from '../admin/logging/admin-logging.module';

@Module({
  imports: [MediaModule, AniListModule, AdminLoggingModule],
  controllers: [AnimesController],
  providers: [AnimesService, PrismaService, CacheService],
  exports: [AnimesService],
})
export class AnimesModule {}

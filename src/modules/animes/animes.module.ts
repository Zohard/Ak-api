import { Module } from '@nestjs/common';
import { AnimesService } from './animes.service';
import { AnimesController } from './animes.controller';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { MediaModule } from '../media/media.module';
import { AniListModule } from '../anilist/anilist.module';
import { JikanModule } from '../jikan/jikan.module';
import { AdminLoggingModule } from '../admin/logging/admin-logging.module';
import { AnimeRelationsService } from './services/anime-relations.service';
import { AnimeStaffService } from './services/anime-staff.service';
import { AnimeTrailersService } from './services/anime-trailers.service';
import { AnimeRankingsService } from './services/anime-rankings.service';
import { AnimeExternalService } from './services/anime-external.service';
import { AnimeCacheService } from './services/anime-cache.service';

@Module({
  imports: [MediaModule, AniListModule, JikanModule, AdminLoggingModule],
  controllers: [AnimesController],
  providers: [
    AnimesService,
    PrismaService,
    CacheService,
    AnimeRelationsService,
    AnimeStaffService,
    AnimeTrailersService,
    AnimeRankingsService,
    AnimeExternalService,
    AnimeCacheService,
  ],
  exports: [AnimesService],
})
export class AnimesModule {}

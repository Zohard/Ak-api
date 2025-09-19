import { Module } from '@nestjs/common';
import { MangasService } from './mangas.service';
import { MangasController } from './mangas.controller';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { MediaModule } from '../media/media.module';
import { AniListModule } from '../anilist/anilist.module';

@Module({
  imports: [MediaModule, AniListModule],
  controllers: [MangasController],
  providers: [MangasService, PrismaService, CacheService],
  exports: [MangasService],
})
export class MangasModule {}

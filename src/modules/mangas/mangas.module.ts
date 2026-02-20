import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MangasService } from './mangas.service';
import { GoogleBooksService } from './google-books.service';
import { MangaVolumesService } from './manga-volumes.service';
import { NautiljonService } from './nautiljon.service';
import { MangaCollecService } from './mangacollec.service';
import { MangasController } from './mangas.controller';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { MediaModule } from '../media/media.module';
import { AniListModule } from '../anilist/anilist.module';
import { BooksModule } from '../books/books.module';
import { ScrapeModule } from '../scrape/scrape.module';
import { JikanModule } from '../jikan/jikan.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    MediaModule,
    AniListModule,
    BooksModule,
    ScrapeModule,
    JikanModule,
  ],
  controllers: [MangasController],
  providers: [MangasService, GoogleBooksService, MangaVolumesService, NautiljonService, MangaCollecService, PrismaService, CacheService],
  exports: [MangasService, MangaVolumesService, NautiljonService, MangaCollecService],
})
export class MangasModule {}

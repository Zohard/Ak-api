import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AdminContentController } from './admin-content.controller';
import { AdminContentService } from './admin-content.service';
import { AdminAnimesController } from './admin-animes.controller';
import { AdminAnimesService } from './admin-animes.service';
import { AdminMangasController } from './admin-mangas.controller';
import { AdminMangasService } from './admin-mangas.service';
import { AdminBusinessController } from './admin-business.controller';
import { AdminBusinessService } from './admin-business.service';
import { AdminJeuxVideoController } from './admin-jeux-video.controller';
import { AdminJeuxVideoService } from './admin-jeux-video.service';
import { AdminPlatformsController } from './admin-platforms.controller';
import { AdminGenresController } from './admin-genres.controller';
import { AdminTagsController } from './admin-tags.controller';
import { SourcesExternesController } from './sources-externes.controller';
import { SourcesExternesService } from './sources-externes.service';
import { AniListImportController } from './anilist-import.controller';
import { AniListImportService } from './anilist-import.service';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';
import { IgdbService } from '../../../shared/services/igdb.service';
import { DeepLService } from '../../../shared/services/deepl.service';
import { GoogleBooksService } from '../../mangas/google-books.service';
import { MediaModule } from '../../media/media.module';
import { AdminLoggingModule } from '../logging/admin-logging.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [HttpModule, MediaModule, AdminLoggingModule, NotificationsModule],
  controllers: [AdminContentController, AdminAnimesController, AdminMangasController, AdminBusinessController, AdminJeuxVideoController, AdminPlatformsController, AdminGenresController, AdminTagsController, SourcesExternesController, AniListImportController],
  providers: [AdminContentService, AdminAnimesService, AdminMangasService, AdminBusinessService, AdminJeuxVideoService, SourcesExternesService, AniListImportService, PrismaService, CacheService, IgdbService, DeepLService, GoogleBooksService],
  exports: [AdminContentService, AniListImportService],
})
export class AdminContentModule {}

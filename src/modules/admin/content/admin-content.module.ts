import { Module } from '@nestjs/common';
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
import { PrismaService } from '../../../shared/services/prisma.service';
import { IgdbService } from '../../../shared/services/igdb.service';
import { DeepLService } from '../../../shared/services/deepl.service';
import { MediaModule } from '../../media/media.module';
import { AdminLoggingModule } from '../logging/admin-logging.module';

@Module({
  imports: [MediaModule, AdminLoggingModule],
  controllers: [AdminContentController, AdminAnimesController, AdminMangasController, AdminBusinessController, AdminJeuxVideoController, AdminPlatformsController, AdminGenresController, AdminTagsController, SourcesExternesController],
  providers: [AdminContentService, AdminAnimesService, AdminMangasService, AdminBusinessService, AdminJeuxVideoService, SourcesExternesService, PrismaService, IgdbService, DeepLService],
  exports: [AdminContentService],
})
export class AdminContentModule {}

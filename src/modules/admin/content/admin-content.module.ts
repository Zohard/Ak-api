import { Module } from '@nestjs/common';
import { AdminContentController } from './admin-content.controller';
import { AdminContentService } from './admin-content.service';
import { AdminAnimesController } from './admin-animes.controller';
import { AdminAnimesService } from './admin-animes.service';
import { AdminMangasController } from './admin-mangas.controller';
import { AdminMangasService } from './admin-mangas.service';
import { AdminBusinessController } from './admin-business.controller';
import { AdminBusinessService } from './admin-business.service';
import { NautiljonImportController } from './nautiljon-import.controller';
import { NautiljonImportService } from './nautiljon-import.service';
import { PrismaService } from '../../../shared/services/prisma.service';

@Module({
  controllers: [AdminContentController, AdminAnimesController, AdminMangasController, AdminBusinessController, NautiljonImportController],
  providers: [AdminContentService, AdminAnimesService, AdminMangasService, AdminBusinessService, NautiljonImportService, PrismaService],
  exports: [AdminContentService],
})
export class AdminContentModule {}

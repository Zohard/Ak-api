import { Module } from '@nestjs/common';
import { ScrapeController } from './scrape.controller';
import { ScrapeService } from './scrape.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { AniListModule } from '../anilist/anilist.module';

@Module({
  imports: [AniListModule],
  controllers: [ScrapeController],
  providers: [ScrapeService, PrismaService],
  exports: [ScrapeService],
})
export class ScrapeModule {}

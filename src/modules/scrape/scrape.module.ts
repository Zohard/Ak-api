import { Module } from '@nestjs/common';
import { ScrapeController } from './scrape.controller';
import { ScrapeService } from './scrape.service';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [ScrapeController],
  providers: [ScrapeService, PrismaService],
  exports: [ScrapeService],
})
export class ScrapeModule {}

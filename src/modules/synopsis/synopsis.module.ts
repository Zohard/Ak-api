import { Module } from '@nestjs/common';
import { SynopsisService } from './synopsis.service';
import { SynopsisController } from './synopsis.controller';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

@Module({
  controllers: [SynopsisController],
  providers: [SynopsisService, PrismaService, CacheService],
  exports: [SynopsisService],
})
export class SynopsisModule {}
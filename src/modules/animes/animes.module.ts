import { Module } from '@nestjs/common';
import { AnimesService } from './animes.service';
import { AnimesController } from './animes.controller';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

@Module({
  controllers: [AnimesController],
  providers: [AnimesService, PrismaService, CacheService],
  exports: [AnimesService],
})
export class AnimesModule {}

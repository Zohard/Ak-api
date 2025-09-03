import { Module } from '@nestjs/common';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

@Module({
  controllers: [SeasonsController],
  providers: [SeasonsService, PrismaService, CacheService],
  exports: [SeasonsService],
})
export class SeasonsModule {}
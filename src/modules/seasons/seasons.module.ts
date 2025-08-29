import { Module } from '@nestjs/common';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [SeasonsController],
  providers: [SeasonsService, PrismaService],
  exports: [SeasonsService],
})
export class SeasonsModule {}
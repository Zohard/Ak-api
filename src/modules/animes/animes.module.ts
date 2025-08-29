import { Module } from '@nestjs/common';
import { AnimesService } from './animes.service';
import { AnimesController } from './animes.controller';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [AnimesController],
  providers: [AnimesService, PrismaService],
  exports: [AnimesService],
})
export class AnimesModule {}

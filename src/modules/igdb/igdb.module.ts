import { Module } from '@nestjs/common';
import { IgdbController } from './igdb.controller';
import { IgdbService } from '../../shared/services/igdb.service';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [IgdbController],
  providers: [IgdbService, PrismaService],
  exports: [IgdbService],
})
export class IgdbModule {}

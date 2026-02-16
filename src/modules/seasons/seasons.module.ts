import { Module, forwardRef } from '@nestjs/common';
import { SeasonsController } from './seasons.controller';
import { AdminSeasonsController } from './admin.seasons.controller';
import { SeasonsService } from './seasons.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { AnimesModule } from '../animes/animes.module';

@Module({
  imports: [forwardRef(() => AnimesModule)],
  controllers: [SeasonsController, AdminSeasonsController],
  providers: [SeasonsService, PrismaService, CacheService],
  exports: [SeasonsService],
})
export class SeasonsModule { }

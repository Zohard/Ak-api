import { Module } from '@nestjs/common';
import { ListsService } from './lists.service';
import { ListsController } from './lists.controller';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

@Module({
  controllers: [ListsController],
  providers: [ListsService, PrismaService, CacheService],
  exports: [ListsService],
})
export class ListsModule {}


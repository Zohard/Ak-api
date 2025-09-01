import { Module } from '@nestjs/common';
import { ListsService } from './lists.service';
import { ListsController } from './lists.controller';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  controllers: [ListsController],
  providers: [ListsService, PrismaService],
  exports: [ListsService],
})
export class ListsModule {}


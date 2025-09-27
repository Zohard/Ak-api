import { Module } from '@nestjs/common';
import { AdminWritersController } from './admin-writers.controller';
import { AdminWritersService } from './admin-writers.service';
import { PrismaService } from '../../../shared/services/prisma.service';

@Module({
  controllers: [AdminWritersController],
  providers: [AdminWritersService, PrismaService],
  exports: [AdminWritersService],
})
export class AdminWritersModule {}
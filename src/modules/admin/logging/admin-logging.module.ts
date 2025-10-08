import { Module } from '@nestjs/common';
import { AdminLoggingService } from './admin-logging.service';
import { AdminLoggingController } from './admin-logging.controller';
import { PrismaService } from '../../../shared/services/prisma.service';

@Module({
  controllers: [AdminLoggingController],
  providers: [AdminLoggingService, PrismaService],
  exports: [AdminLoggingService],
})
export class AdminLoggingModule {}

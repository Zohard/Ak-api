import { Module } from '@nestjs/common';
import { AdminLoggingService } from './admin-logging.service';
import { PrismaService } from '../../../shared/services/prisma.service';

@Module({
  providers: [AdminLoggingService, PrismaService],
  exports: [AdminLoggingService],
})
export class AdminLoggingModule {}

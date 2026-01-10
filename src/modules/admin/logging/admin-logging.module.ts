import { Module } from '@nestjs/common';
import { AdminLoggingService } from './admin-logging.service';
import {
  AdminLoggingController,
  ClientErrorLoggingController,
} from './admin-logging.controller';
import { SentryController } from './sentry.controller';
import { SentryService } from './sentry.service';
import { PrismaService } from '../../../shared/services/prisma.service';

@Module({
  controllers: [AdminLoggingController, ClientErrorLoggingController, SentryController],
  providers: [AdminLoggingService, SentryService, PrismaService],
  exports: [AdminLoggingService, SentryService],
})
export class AdminLoggingModule {}

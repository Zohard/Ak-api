import { Module } from '@nestjs/common';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminModerationService } from './admin-moderation.service';
import { PrismaService } from '../../../shared/services/prisma.service';

@Module({
  controllers: [AdminModerationController],
  providers: [AdminModerationService, PrismaService],
  exports: [AdminModerationService],
})
export class AdminModerationModule {}

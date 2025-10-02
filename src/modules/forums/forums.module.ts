import { Module } from '@nestjs/common';
import { ForumsController } from './forums.controller';
import { ForumsService } from './forums.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { ActivityTrackerService } from '../../shared/services/activity-tracker.service';

@Module({
  controllers: [ForumsController],
  providers: [ForumsService, PrismaService, ActivityTrackerService],
  exports: [ForumsService, ActivityTrackerService],
})
export class ForumsModule {}
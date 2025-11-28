import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PopularityJobService } from './popularity-job.service';
import { EventsJobService } from './events-job.service';
import { ReviewsModule } from '../reviews/reviews.module';
import { EventsModule } from '../events/events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ReviewsModule,
    EventsModule,
    NotificationsModule,
  ],
  providers: [PopularityJobService, EventsJobService, PrismaService],
  exports: [PopularityJobService, EventsJobService],
})
export class JobsModule {}
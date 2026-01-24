import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PopularityJobService } from './popularity-job.service';
import { EventsJobService } from './events-job.service';
import { NotificationsJobService } from './notifications-job.service';
import { JobsCronController } from './jobs-cron.controller';
import { ReviewsModule } from '../reviews/reviews.module';
import { EventsModule } from '../events/events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnimesModule } from '../animes/animes.module';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ReviewsModule,
    EventsModule,
    NotificationsModule,
    AnimesModule,
  ],
  controllers: [JobsCronController],
  providers: [PopularityJobService, EventsJobService, NotificationsJobService, PrismaService],
  exports: [PopularityJobService, EventsJobService, NotificationsJobService],
})
export class JobsModule { }
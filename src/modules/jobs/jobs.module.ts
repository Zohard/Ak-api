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
import { CronModule } from '../cron/cron.module';
import { PrismaService } from '../../shared/services/prisma.service';
import { PopularityService } from '../../shared/services/popularity.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    EventsModule,
    NotificationsModule,
    AnimesModule,
    CronModule,
  ],
  controllers: [JobsCronController],
  providers: [PopularityJobService, EventsJobService, NotificationsJobService, PrismaService, PopularityService],
  exports: [PopularityJobService, EventsJobService, NotificationsJobService],
})
export class JobsModule { }
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PopularityJobService } from './popularity-job.service';
import { ReviewsModule } from '../reviews/reviews.module';
import { PrismaService } from '../../shared/services/prisma.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ReviewsModule,
  ],
  providers: [PopularityJobService, PrismaService],
  exports: [PopularityJobService],
})
export class JobsModule {}
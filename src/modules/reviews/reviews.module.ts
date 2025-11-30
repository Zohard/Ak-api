import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { AdminReviewsController } from './admin/admin-reviews.controller';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { PopularityService } from '../../shared/services/popularity.service';
import { EmailService } from '../../shared/services/email.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ReviewsController, AdminReviewsController],
  providers: [ReviewsService, PrismaService, CacheService, PopularityService, EmailService],
  exports: [ReviewsService],
})
export class ReviewsModule {}

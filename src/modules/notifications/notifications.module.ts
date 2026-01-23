import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsCronController } from './notifications-cron.controller';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { AnimesModule } from '../animes/animes.module';

@Module({
  imports: [AnimesModule],
  controllers: [NotificationsController, NotificationsCronController],
  providers: [NotificationsService, PrismaService],
  exports: [NotificationsService],
})
export class NotificationsModule { }

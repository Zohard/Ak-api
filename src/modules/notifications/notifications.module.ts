import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsCronController } from './notifications-cron.controller';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { EmailService } from '../../shared/services/email.service';
import { AnimesModule } from '../animes/animes.module';
import { MangasModule } from '../mangas/mangas.module';

@Module({
  imports: [AnimesModule, MangasModule],
  controllers: [NotificationsController, NotificationsCronController],
  providers: [NotificationsService, PrismaService, EmailService],
  exports: [NotificationsService],
})
export class NotificationsModule { }

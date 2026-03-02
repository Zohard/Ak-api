import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { CaptchaService } from '../../shared/services/captcha.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule, ConfigModule],
  controllers: [EventsController],
  providers: [EventsService, PrismaService, CacheService, CaptchaService],
  exports: [EventsService],
})
export class EventsModule {}

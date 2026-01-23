import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../shared/services/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class NotificationsJobService {
    private readonly logger = new Logger(NotificationsJobService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationsService: NotificationsService,
    ) { }

    @Cron(CronExpression.EVERY_DAY_AT_10AM)
    async checkDailyEpisodes() {
        this.logger.log('Starting daily episode check...');
        try {
            await this.notificationsService.checkAndNotifyReleasedEpisodes();
            this.logger.log('Daily episode notifications sent successfully.');
        } catch (error) {
            this.logger.error(`Error checking daily episodes: ${error.message}`);
        }
    }
}

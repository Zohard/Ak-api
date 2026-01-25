import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class NotificationsJobService {
    private readonly logger = new Logger(NotificationsJobService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationsService: NotificationsService,
    ) { }

    // Removed @Cron decorator - now triggered via external cron calling /api/notifications/cron/check-releases
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

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../shared/services/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EpisodesService } from '../animes/episodes/episodes.service';

@Injectable()
export class NotificationsJobService {
    private readonly logger = new Logger(NotificationsJobService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationsService: NotificationsService,
        private readonly episodesService: EpisodesService,
    ) { }

    @Cron(CronExpression.EVERY_DAY_AT_10AM)
    async checkDailyEpisodes() {
        this.logger.log('Starting daily episode check...');
        const today = new Date();

        try {
            // 1. Get episodes released today
            const episodes = await this.episodesService.getEpisodesByDate(today);

            if (episodes.length === 0) {
                this.logger.log('No episodes released today.');
                return;
            }

            this.logger.log(`Found ${episodes.length} episodes released today.`);

            for (const episode of episodes) {
                if (!episode.anime) continue;

                // 2. Find users who have this anime in their collection
                // Status 1 = Watching, 2 = Plan to Watch (maybe include just watching?)
                // Let's include Watching (1), Plan to Watch (2), On Hold (3)
                // Usually, people want notifs for things they are Watching or Plan to Watch.
                const users = await this.prisma.collectionAnime.findMany({
                    where: {
                        idAnime: episode.idAnime,
                        type: { in: [1, 2, 3] } // Watching, Plan to Watch, On Hold
                    },
                    select: { idMembre: true }
                });

                if (users.length === 0) continue;

                this.logger.log(`Notifying ${users.length} users for ${episode.anime.titre} episode ${episode.numero}`);

                // 3. Send notifications
                for (const user of users) {
                    await this.notificationsService.sendNotification({
                        userId: user.idMembre,
                        type: 'episode_release',
                        title: `Nouvel épisode : ${episode.anime.titre}`,
                        message: `L'épisode ${episode.numero} de ${episode.anime.titre} est disponible !`,
                        data: {
                            animeId: episode.idAnime,
                            animeSlug: episode.anime.niceUrl,
                            episodeId: episode.idEpisode,
                            episodeNum: episode.numero,
                            image: episode.image || episode.anime.image
                        },
                        priority: 'medium'
                    });
                }
            }

            this.logger.log('Daily episode notifications sent successfully.');
        } catch (error) {
            this.logger.error(`Error checking daily episodes: ${error.message}`);
        }
    }
}

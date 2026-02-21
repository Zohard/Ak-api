import {
    Controller,
    Post,
    Get,
    UseGuards,
    Query,
    Logger as NestLogger,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiHeader,
    ApiQuery,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PopularityJobService } from './popularity-job.service';
import { AnimeRankingsService } from '../animes/services/anime-rankings.service';
import { CronAuthGuard } from '../../common/guards/cron-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CronService } from '../cron/cron.service';

@ApiTags('Jobs Cron')
@SkipThrottle()
@Controller('jobs/cron')
export class JobsCronController {
    private readonly logger = new NestLogger(JobsCronController.name);

    constructor(
        private readonly popularityJobService: PopularityJobService,
        private readonly animeRankingsService: AnimeRankingsService,
        private readonly cronService: CronService,
    ) { }

    @Post('popularity/daily')
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiHeader({
        name: 'x-cron-api-key',
        description: 'API Key for external cron jobs',
        required: false,
    })
    @ApiOperation({ summary: 'Trigger daily popularity recalculation (recent reviews)' })
    @ApiResponse({ status: 200, description: 'Daily recalculation completed' })
    async triggerDailyPopularity() {
        const startTime = Date.now();
        try {
            await this.popularityJobService.recalculateRecentReviewsPopularity();
            const duration = Date.now() - startTime;

            return {
                success: true,
                job: 'daily-popularity',
                message: 'Daily popularity recalculation for recent reviews completed',
                duration: `${duration}ms`,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error(`Daily popularity job failed: ${error.message}`, error.stack);
            return {
                success: false,
                job: 'daily-popularity',
                message: `Job failed: ${error.message}`,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString(),
            };
        }
    }

    @Post('popularity/weekly')
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiHeader({
        name: 'x-cron-api-key',
        description: 'API Key for external cron jobs',
        required: false,
    })
    @ApiOperation({ summary: 'Trigger weekly popularity recalculation (all reviews)' })
    @ApiResponse({ status: 200, description: 'Weekly recalculation completed' })
    async triggerWeeklyPopularity() {
        const startTime = Date.now();
        try {
            await this.popularityJobService.recalculateAllReviewsPopularity();
            const duration = Date.now() - startTime;

            return {
                success: true,
                job: 'weekly-popularity',
                message: 'Weekly popularity recalculation for all reviews completed',
                duration: `${duration}ms`,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error(`Weekly popularity job failed: ${error.message}`, error.stack);
            return {
                success: false,
                job: 'weekly-popularity',
                message: `Job failed: ${error.message}`,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString(),
            };
        }
    }

    @Post('counters/reset-daily')
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiHeader({
        name: 'x-cron-api-key',
        description: 'API Key for external cron jobs',
        required: false,
    })
    @ApiOperation({ summary: 'Reset daily view counters' })
    @ApiResponse({ status: 200, description: 'Daily counters reset' })
    async resetDailyCounters() {
        try {
            await this.popularityJobService.resetDailyCounters();

            return {
                success: true,
                job: 'reset-daily-counters',
                message: 'Daily view counters reset completed',
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`Reset daily counters failed: ${error.message}`, error.stack);
            return {
                success: false,
                job: 'reset-daily-counters',
                message: `Job failed: ${error.message}`,
                timestamp: new Date().toISOString(),
            };
        }
    }

    @Post('counters/reset-weekly')
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiHeader({
        name: 'x-cron-api-key',
        description: 'API Key for external cron jobs',
        required: false,
    })
    @ApiOperation({ summary: 'Reset weekly view counters' })
    @ApiResponse({ status: 200, description: 'Weekly counters reset' })
    async resetWeeklyCounters() {
        try {
            await this.popularityJobService.resetWeeklyCounters();

            return {
                success: true,
                job: 'reset-weekly-counters',
                message: 'Weekly view counters reset completed',
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`Reset weekly counters failed: ${error.message}`, error.stack);
            return {
                success: false,
                job: 'reset-weekly-counters',
                message: `Job failed: ${error.message}`,
                timestamp: new Date().toISOString(),
            };
        }
    }

    @Post('counters/reset-monthly')
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiHeader({
        name: 'x-cron-api-key',
        description: 'API Key for external cron jobs',
        required: false,
    })
    @ApiOperation({ summary: 'Reset monthly view counters' })
    @ApiResponse({ status: 200, description: 'Monthly counters reset' })
    async resetMonthlyCounters() {
        try {
            await this.popularityJobService.resetMonthlyCounters();

            return {
                success: true,
                job: 'reset-monthly-counters',
                message: 'Monthly view counters reset completed',
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`Reset monthly counters failed: ${error.message}`, error.stack);
            return {
                success: false,
                job: 'reset-monthly-counters',
                message: `Job failed: ${error.message}`,
                timestamp: new Date().toISOString(),
            };
        }
    }

    @Get('stats')
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiHeader({
        name: 'x-cron-api-key',
        description: 'API Key for external cron jobs',
        required: false,
    })
    @ApiOperation({ summary: 'Get job statistics' })
    @ApiResponse({ status: 200, description: 'Job statistics' })
    async getStats() {
        const stats = await this.popularityJobService.getJobStats();

        return {
            success: true,
            data: stats,
        };
    }

    @Get('list')
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiOperation({ summary: 'List all available jobs' })
    @ApiResponse({ status: 200, description: 'List of available jobs' })
    async listJobs() {
        return {
            success: true,
            jobs: [
                {
                    id: 'popularity-daily',
                    name: 'Popularité quotidienne',
                    description: 'Recalcule la popularité des critiques récentes',
                    endpoint: 'popularity/daily',
                    method: 'POST',
                    category: 'popularity',
                },
                {
                    id: 'popularity-weekly',
                    name: 'Popularité hebdomadaire',
                    description: 'Recalcule la popularité de toutes les critiques',
                    endpoint: 'popularity/weekly',
                    method: 'POST',
                    category: 'popularity',
                },
                {
                    id: 'review-rankings',
                    name: 'Classement des critiques',
                    description: 'Met à jour le classement de popularité des critiques',
                    endpoint: 'reviews/rankings',
                    method: 'POST',
                    category: 'rankings',
                },
                {
                    id: 'weekly-rankings',
                    name: 'Classement anime hebdomadaire',
                    description: 'Génère le classement hebdomadaire des animes de la saison',
                    endpoint: 'rankings/weekly',
                    method: 'POST',
                    category: 'rankings',
                },
                {
                    id: 'reset-daily-counters',
                    name: 'Reset compteurs quotidiens',
                    description: 'Remet à zéro les compteurs de vues quotidiens',
                    endpoint: 'counters/reset-daily',
                    method: 'POST',
                    category: 'counters',
                    danger: true,
                },
                {
                    id: 'reset-weekly-counters',
                    name: 'Reset compteurs hebdomadaires',
                    description: 'Remet à zéro les compteurs de vues hebdomadaires',
                    endpoint: 'counters/reset-weekly',
                    method: 'POST',
                    category: 'counters',
                    danger: true,
                },
                {
                    id: 'reset-monthly-counters',
                    name: 'Reset compteurs mensuels',
                    description: 'Remet à zéro les compteurs de vues mensuels',
                    endpoint: 'counters/reset-monthly',
                    method: 'POST',
                    category: 'counters',
                    danger: true,
                },
                {
                    id: 'anime-popularity',
                    name: 'Popularité Animes',
                    description: 'Recalcule les classements de popularité des animes',
                    endpoint: 'general/anime-popularity',
                    method: 'POST',
                    category: 'system',
                },
                {
                    id: 'manga-popularity',
                    name: 'Popularité Mangas',
                    description: 'Recalcule les classements de popularité des mangas',
                    endpoint: 'general/manga-popularity',
                    method: 'POST',
                    category: 'system',
                },
                {
                    id: 'anime-episode-count',
                    name: 'Compteur Episodes',
                    description: 'Met à jour le nombre d\'épisodes des animes (sync)',
                    endpoint: 'general/anime-episode-count',
                    method: 'POST',
                    category: 'system',
                },
                {
                    id: 'manga-sync-volumes',
                    name: 'Sync Volumes Mangas',
                    description: 'Télécharge les sorties manga depuis Nautiljon (mois courant)',
                    endpoint: 'mangas/sync-volumes',
                    method: 'POST',
                    category: 'system',
                },
            ],
        };
    }

    @Post('mangas/sync-volumes')
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiHeader({
        name: 'x-cron-api-key',
        description: 'API Key for external cron jobs',
        required: false,
    })
    @ApiOperation({ summary: 'Trigger manga volume sync' })
    @ApiResponse({ status: 200, description: 'Manga volume sync started' })
    async triggerMangaVolumeSync() {
        try {
            const result = await this.cronService.syncMangaVolumes(10);
            const titles = result.results.map(r => r.title).join(', ');
            return {
                success: true,
                job: 'manga-sync-volumes',
                message: `Processed ${result.processed} mangas: ${titles}`,
                stats: {
                    processed: result.processed,
                    results: result.results
                },
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`Manga volume sync failed: ${error.message}`, error.stack);
            return {
                success: false,
                job: 'manga-sync-volumes',
                message: `Job failed: ${error.message}`,
                timestamp: new Date().toISOString(),
            };
        }
    }

    @Post('general/anime-popularity')
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiHeader({
        name: 'x-cron-api-key',
        description: 'API Key for external cron jobs',
        required: false,
    })
    @ApiOperation({ summary: 'Trigger anime popularity update' })
    @ApiResponse({ status: 200, description: 'Anime popularity updated' })
    async triggerAnimePopularity() {
        try {
            const result = await this.cronService.updateAnimePopularity();
            return {
                success: true,
                job: 'anime-popularity',
                message: result.message,
                stats: result.stats,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`Anime popularity job failed: ${error.message}`, error.stack);
            return {
                success: false,
                job: 'anime-popularity',
                message: `Job failed: ${error.message}`,
                timestamp: new Date().toISOString(),
            };
        }
    }

    @Post('general/manga-popularity')
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiHeader({
        name: 'x-cron-api-key',
        description: 'API Key for external cron jobs',
        required: false,
    })
    @ApiOperation({ summary: 'Trigger manga popularity update' })
    @ApiResponse({ status: 200, description: 'Manga popularity updated' })
    async triggerMangaPopularity() {
        try {
            const result = await this.cronService.updateMangaPopularity();
            return {
                success: true,
                job: 'manga-popularity',
                message: result.message,
                stats: result.stats,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`Manga popularity job failed: ${error.message}`, error.stack);
            return {
                success: false,
                job: 'manga-popularity',
                message: `Job failed: ${error.message}`,
                timestamp: new Date().toISOString(),
            };
        }
    }

    @Post('general/anime-episode-count')
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiHeader({
        name: 'x-cron-api-key',
        description: 'API Key for external cron jobs',
        required: false,
    })
    @ApiOperation({ summary: 'Trigger anime episode count update' })
    @ApiResponse({ status: 200, description: 'Anime episode count updated' })
    async triggerAnimeEpisodeCount() {
        try {
            const result = await (this.cronService as any).updateAnimeEpisodeCount();
            return {
                success: true,
                job: 'anime-episode-count',
                message: result.message,
                stats: result.stats,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`Anime episode count job failed: ${error.message}`, error.stack);
            return {
                success: false,
                job: 'anime-episode-count',
                message: `Job failed: ${error.message}`,
                timestamp: new Date().toISOString(),
            };
        }
    }

    @Post('general/manga-volume-count')
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiHeader({
        name: 'x-cron-api-key',
        description: 'API Key for external cron jobs',
        required: false,
    })
    @ApiOperation({ summary: 'Update manga nb_vol from actual volume records (only if higher)' })
    @ApiResponse({ status: 200, description: 'Manga volume count updated' })
    async triggerMangaVolumeCount() {
        try {
            const result = await this.cronService.updateMangaVolumeCount();
            return {
                success: true,
                job: 'manga-volume-count',
                message: result.message,
                stats: result.stats,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`Manga volume count job failed: ${error.message}`, error.stack);
            return {
                success: false,
                job: 'manga-volume-count',
                message: `Job failed: ${error.message}`,
                timestamp: new Date().toISOString(),
            };
        }
    }

    @Post('rankings/weekly')
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiHeader({
        name: 'x-cron-api-key',
        description: 'API Key for external cron jobs',
        required: false,
    })
    @ApiOperation({ summary: 'Generate weekly anime rankings for current season' })
    @ApiResponse({ status: 200, description: 'Weekly rankings generated' })
    async generateWeeklyRankings() {
        const startTime = Date.now();
        try {
            const { year, season, week } = this.getCurrentSeasonInfo();

            const result = await this.animeRankingsService.generateWeeklyRanking(year, season, week);
            const duration = Date.now() - startTime;

            return {
                success: true,
                job: 'weekly-rankings',
                message: `Weekly anime rankings generated for ${season} ${year} week ${week}`,
                year,
                season,
                week,
                count: result.count || 0,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error(`Weekly rankings job failed: ${error.message}`, error.stack);
            return {
                success: false,
                job: 'weekly-rankings',
                message: `Job failed: ${error.message}`,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString(),
            };
        }
    }

    @Post('reviews/rankings')
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiHeader({
        name: 'x-cron-api-key',
        description: 'API Key for external cron jobs',
        required: false,
    })
    @ApiOperation({
        summary: 'Update review popularity rankings',
        description: 'Calculates popularity scores for all reviews based on views, interactions (c=Convaincante, a=Amusante, o=Originale, y=Agree, n=Disagree), and other factors. Updates classementPopularite and stores historical rankings in variationPopularite as JSON.',
    })
    @ApiResponse({ status: 200, description: 'Review rankings updated successfully' })
    async updateReviewRankings() {
        const startTime = Date.now();
        try {
            const result = await this.popularityJobService.updateReviewRankings();
            const duration = Date.now() - startTime;

            return {
                success: result.success,
                job: 'review-rankings',
                message: result.message,
                stats: result.stats,
                top10: result.top10,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error(`Review rankings job failed: ${error.message}`, error.stack);
            return {
                success: false,
                job: 'review-rankings',
                message: `Job failed: ${error.message}`,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString(),
            };
        }
    }

    @Get('debug/sentry')
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiHeader({
        name: 'x-cron-api-key',
        description: 'API Key for external cron jobs',
        required: false,
    })
    @ApiOperation({ summary: 'Test Sentry integration by throwing an error' })
    async testSentry() {
        this.logger.log('Triggering intentional error for Sentry test');
        throw new Error('Sentry Test Error from JobsCronController');
    }

    private getCurrentSeasonInfo(): { year: number; season: string; week: number } {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth(); // 0-indexed

        // Determine season based on month
        let season: string;
        if (month >= 0 && month <= 2) {
            season = 'WINTER'; // Jan-Mar
        } else if (month >= 3 && month <= 5) {
            season = 'SPRING'; // Apr-Jun
        } else if (month >= 6 && month <= 8) {
            season = 'SUMMER'; // Jul-Sep
        } else {
            season = 'FALL'; // Oct-Dec
        }

        // Calculate ISO week number
        const week = this.getISOWeek(now);

        return { year, season, week };
    }

    private getISOWeek(date: Date): number {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    }
}

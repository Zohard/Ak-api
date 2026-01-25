import {
    Controller,
    Post,
    Get,
    UseGuards,
    Query,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiHeader,
    ApiQuery,
} from '@nestjs/swagger';
import { PopularityJobService } from './popularity-job.service';
import { AnimeRankingsService } from '../animes/services/anime-rankings.service';
import { CronAuthGuard } from '../../common/guards/cron-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';

@ApiTags('Jobs Cron')
@Controller('jobs/cron')
export class JobsCronController {
    constructor(
        private readonly popularityJobService: PopularityJobService,
        private readonly animeRankingsService: AnimeRankingsService,
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
        await this.popularityJobService.recalculateRecentReviewsPopularity();
        const duration = Date.now() - startTime;

        return {
            success: true,
            job: 'daily-popularity',
            message: 'Daily popularity recalculation for recent reviews completed',
            duration: `${duration}ms`,
            timestamp: new Date().toISOString(),
        };
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
        await this.popularityJobService.recalculateAllReviewsPopularity();
        const duration = Date.now() - startTime;

        return {
            success: true,
            job: 'weekly-popularity',
            message: 'Weekly popularity recalculation for all reviews completed',
            duration: `${duration}ms`,
            timestamp: new Date().toISOString(),
        };
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
        await this.popularityJobService.resetDailyCounters();

        return {
            success: true,
            job: 'reset-daily-counters',
            message: 'Daily view counters reset completed',
            timestamp: new Date().toISOString(),
        };
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
        await this.popularityJobService.resetWeeklyCounters();

        return {
            success: true,
            job: 'reset-weekly-counters',
            message: 'Weekly view counters reset completed',
            timestamp: new Date().toISOString(),
        };
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
        await this.popularityJobService.resetMonthlyCounters();

        return {
            success: true,
            job: 'reset-monthly-counters',
            message: 'Monthly view counters reset completed',
            timestamp: new Date().toISOString(),
        };
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

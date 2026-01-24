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
import { CronAuthGuard } from '../../common/guards/cron-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';

@ApiTags('Jobs Cron')
@Controller('jobs/cron')
export class JobsCronController {
    constructor(private readonly popularityJobService: PopularityJobService) { }

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
}

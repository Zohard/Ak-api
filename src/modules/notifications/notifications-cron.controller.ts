import {
    Controller,
    Post,
    UseGuards,
    Query,
    Req,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiHeader,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CronAuthGuard } from '../../common/guards/cron-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';

@ApiTags('Notifications Cron')
@Controller('notifications/cron')
export class NotificationsCronController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Post('check-releases')
    // We apply CronAuthGuard.
    // BUT we also want to support Admin triggering from frontend.
    // CronAuthGuard handles both: checks API Key OR checks request.user if available.
    // HOWEVER, request.user is populated by JwtAuthGuard.
    // Since this controller does NOT has JwtAuthGuard at class level, we need it for the Admin fallback case.
    // But we can't enforce it for the Cron case.
    // So we probably need a custom arrangement.
    //
    // Option 1: CronAuthGuard does everything. But it needs to decode JWT if no API key?
    // Option 2: Use an "OptionalJwtAuthGuard" first?
    // Let's check if OptionalJwtAuthGuard exists.
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiHeader({
        name: 'x-cron-api-key',
        description: 'API Key for external cron jobs',
        required: false,
    })
    @ApiOperation({ summary: 'Trigger check for new episodes (Cron/Manual)' })
    @ApiResponse({ status: 200, description: 'Check completed' })
    async checkReleases(@Query('date') dateStr?: string) {
        const date = dateStr ? new Date(dateStr) : new Date();
        const result = await this.notificationsService.checkAndNotifyReleasedEpisodes(date);
        return {
            success: true,
            data: result,
            message: `Checked releases for ${date.toISOString().split('T')[0]}. Found ${result.episodesFound} episodes, sent ${result.notificationsSent} notifications.`
        };
    }

    @Post('check-manga-releases')
    @UseGuards(OptionalJwtAuthGuard, CronAuthGuard)
    @ApiHeader({
        name: 'x-cron-api-key',
        description: 'API Key for external cron jobs',
        required: false,
    })
    @ApiOperation({ summary: 'Trigger check for new manga volumes (Cron/Manual)' })
    @ApiResponse({ status: 200, description: 'Check completed' })
    async checkMangaReleases(@Query('date') dateStr?: string) {
        const date = dateStr ? new Date(dateStr) : new Date();
        const result = await this.notificationsService.checkAndNotifyReleasedVolumes(date);
        return {
            success: true,
            data: result,
            message: `Checked volume releases for ${date.toISOString().split('T')[0]}. Found ${result.volumesFound} volumes, sent ${result.notificationsSent} notifications.`
        };
    }
}

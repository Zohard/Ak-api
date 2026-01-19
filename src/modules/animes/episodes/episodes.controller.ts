import { Controller, Get, Post, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { EpisodesService } from './episodes.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';

@Controller('animes')
export class EpisodesController {
    constructor(
        private readonly episodesService: EpisodesService,
    ) { }

    @Get(':id/episodes')
    async getEpisodes(@Param('id', ParseIntPipe) id: number) {
        return this.episodesService.findAllByAnimeId(id);
    }

    @Post(':id/episodes/sync')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async syncEpisodes(@Param('id', ParseIntPipe) id: number) {
        const result = await this.episodesService.fetchAndSyncEpisodes(id);
        return { success: true, count: result.length, episodes: result };
    }
}

@Controller('episodes')
export class EpisodesScheduleController {
    constructor(
        private readonly episodesService: EpisodesService,
    ) { }

    @Get('schedule')
    async getWeeklySchedule(
        @Query('seasonId') seasonId?: string,
        @Query('week') week?: string, // ISO date string for the week start (Monday)
    ) {
        return this.episodesService.getWeeklySchedule(
            seasonId ? parseInt(seasonId) : undefined,
            week ? new Date(week) : undefined,
        );
    }

    @Get('schedule/season/:seasonId')
    async getSeasonSchedule(@Param('seasonId', ParseIntPipe) seasonId: number) {
        return this.episodesService.getSeasonEpisodesSchedule(seasonId);
    }
}

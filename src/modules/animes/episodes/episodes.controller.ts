import { Controller, Get, Post, Param, ParseIntPipe, UseGuards, NotFoundException, forwardRef, Inject } from '@nestjs/common';
import { EpisodesService } from './episodes.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';

@Controller('animes')
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

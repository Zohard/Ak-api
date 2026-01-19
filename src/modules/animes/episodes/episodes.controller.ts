import { Controller, Get, Post, Param, ParseIntPipe, UseGuards, NotFoundException } from '@nestjs/common';
import { EpisodesService } from './episodes.service';
import { AniListService } from '../../anilist/anilist.service';
import { PrismaService } from '../../../shared/services/prisma.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';

@Controller('animes')
export class EpisodesController {
    constructor(
        private readonly episodesService: EpisodesService,
        private readonly anilistService: AniListService,
        private readonly prisma: PrismaService,
    ) { }

    @Get(':id/episodes')
    async getEpisodes(@Param('id', ParseIntPipe) id: number) {
        return this.episodesService.findAllByAnimeId(id);
    }

    @Post(':id/episodes/sync')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async syncEpisodes(@Param('id', ParseIntPipe) id: number) {
        // 1. Get anime to find AniList ID (usually stored in commentaire for now, based on previous files)
        const anime = await this.prisma.akAnime.findUnique({
            where: { idAnime: id },
            select: { commentaire: true, sources: true },
        });

        if (!anime) throw new NotFoundException('Anime not found');

        let anilistId: number | null = null;

        // 1. Try finding in commentaire (stored from import)
        try {
            if (anime.commentaire) {
                // Handle case where commentaire might be just a string or invalid JSON
                if (anime.commentaire.trim().startsWith('{')) {
                    const data = JSON.parse(anime.commentaire);
                    if (data.anilistId) anilistId = data.anilistId;
                }
            }
        } catch (e) {
            console.warn(`Failed to parse commentaire for anime ${id}:`, e.message);
        }

        // 2. If not found, try to find it in sources
        if (!anilistId && anime.sources) {
            // Check for AniList URL in format: https://anilist.co/anime/12345
            // Support http/https, www, and trailing slashes
            const match = anime.sources.match(/anilist\.co\/anime\/(\d+)/);
            if (match && match[1]) {
                anilistId = parseInt(match[1]);
            }
        }

        console.log(`Syncing episodes for anime ${id}. Found AniList ID: ${anilistId}`);

        if (!anilistId) {
            throw new NotFoundException('AniList ID not found. Please add the AniList URL to the "sources" field (e.g., https://anilist.co/anime/12345) or import from AniList.');
        }

        // 2. Fetch schedule from AniList
        // We fetch a wide range or just future? Let's fetch next 50 episodes or similar.
        // Actually getAiringSchedule allows optional start/end.
        // If we want "all known schedule", we can just pass anilistId.
        const schedule = await this.anilistService.getAiringSchedule(anilistId);

        // 3. Sync to DB
        const result = await this.episodesService.syncEpisodes(id, schedule);

        return { success: true, count: result.length, episodes: result };
    }
}

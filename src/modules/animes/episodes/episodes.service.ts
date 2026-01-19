import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { AniListService } from '../../anilist/anilist.service';
import { JikanService } from '../../jikan/jikan.service';
import { Inject, forwardRef, NotFoundException } from '@nestjs/common';

@Injectable()
export class EpisodesService {
    private readonly logger = new Logger(EpisodesService.name);

    constructor(
        private readonly prisma: PrismaService,
        @Inject(forwardRef(() => AniListService))
        private readonly anilistService: AniListService,
        @Inject(forwardRef(() => JikanService))
        private readonly jikanService: JikanService,
    ) { }

    async findAllByAnimeId(animeId: number) {
        return this.prisma.akAnimesEpisode.findMany({
            where: { idAnime: animeId },
            orderBy: { numero: 'asc' },
        });
    }

    private sanitizeString(str: any): string | null {
        if (str === null || str === undefined) return null;
        const strValue = typeof str === 'string' ? str : String(str);
        // Remove null bytes and control characters
        const buffer = Buffer.from(strValue, 'utf8');
        const cleanedBytes = [...buffer].filter(b => b !== 0 && (b >= 0x20 || b === 0x09 || b === 0x0A || b === 0x0D));
        return Buffer.from(cleanedBytes).toString('utf8').trim() || null;
    }

    async syncEpisodes(animeId: number, episodesData: any[]) {
        this.logger.log(`Syncing ${episodesData.length} episodes for anime ${animeId}`);

        return this.prisma.$transaction(async (tx) => {
            const results = [];

            for (const ep of episodesData) {
                // Simple null byte removal - no complex buffer operations
                const cleanString = (str: any): string | null => {
                    if (!str) return null;
                    return String(str).replace(/\0/g, '').trim() || null;
                };

                const titleNative = cleanString(ep.media?.title?.native);
                const titleEnglish = cleanString(ep.media?.title?.english);
                const titleRomaji = cleanString(ep.media?.title?.romaji);
                const image = cleanString(ep.media?.coverImage?.large);

                // Format date as YYYY-MM-DD for VARCHAR(10) column
                let dateDiffusionStr: string | null = null;
                if (ep.airingAt) {
                    const date = new Date(ep.airingAt * 1000);
                    if (!isNaN(date.getTime())) {
                        dateDiffusionStr = date.toISOString().split('T')[0];
                    }
                }

                const existing = await tx.akAnimesEpisode.findFirst({
                    where: { idAnime: animeId, numero: ep.episode },
                });

                if (existing) {
                    const updated = await tx.akAnimesEpisode.update({
                        where: { idEpisode: existing.idEpisode },
                        data: {
                            dateDiffusion: dateDiffusionStr,
                            image: image || undefined,
                        },
                    });
                    results.push(updated);
                } else {
                    const created = await tx.akAnimesEpisode.create({
                        data: {
                            idAnime: animeId,
                            numero: ep.episode,
                            titreOriginal: titleNative,
                            titreJp: titleNative || `Episode ${ep.episode}`,
                            titreFr: null,
                            titreEn: titleEnglish || titleRomaji,
                            dateDiffusion: dateDiffusionStr,
                            image: image,
                            duration: null,
                            dateAjout: new Date(),
                        },
                    });
                    results.push(created);
                }
            }

            return results;
        });
    }
    async fetchAndSyncEpisodes(id: number, force: boolean = false) {
        // 0. Check if episodes already exist to avoid unnecessary API calls
        if (!force) {
            const count = await this.prisma.akAnimesEpisode.count({ where: { idAnime: id } });
            if (count > 0) {
                this.logger.log(`Anime ${id} already has ${count} episodes. Skipping sync.`);
                return [];
            }
        }

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
            this.logger.warn(`Failed to parse commentaire for anime ${id}: ${e.message}`);
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

        this.logger.log(`Syncing episodes for anime ${id}. Found AniList ID: ${anilistId}`);

        if (!anilistId) {
            throw new NotFoundException('AniList ID not found. Please add the AniList URL to the "sources" field (e.g., https://anilist.co/anime/12345) or import from AniList.');
        }

        // 2. Fetch schedule from AniList
        let episodesData = await this.anilistService.getAiringSchedule(anilistId);

        // 3. Fallback to Jikan (MyAnimeList) if AniList returns empty (common for finished anime)
        if (!episodesData || episodesData.length === 0) {
            this.logger.log('AniList schedule is empty. switch to Jikan fallback...');
            const aniListAnime = await this.anilistService.getAnimeById(anilistId);

            if (aniListAnime && aniListAnime.idMal) {
                this.logger.log(`Found MAL ID: ${aniListAnime.idMal}. Fetching episodes from Jikan...`);
                // Use getEpisodes instead of getAnimeEpisodes for consistency with service method name
                const jikanEpisodes = await this.jikanService.getEpisodes(aniListAnime.idMal);

                if (jikanEpisodes && jikanEpisodes.length > 0) {
                    this.logger.log(`Fetched ${jikanEpisodes.length} episodes from Jikan.`);
                    // Map Jikan episodes to matches AniList structure expected by EpisodesService
                    episodesData = jikanEpisodes.map(ep => ({
                        episode: ep.mal_id,
                        media: {
                            title: {
                                romaji: ep.title_romanji || ep.title,
                                english: ep.title_english || ep.title,
                                native: ep.title_japanese
                            },
                            coverImage: {
                                large: null
                            }
                        },
                        airingAt: ep.aired ? new Date(ep.aired).getTime() / 1000 : 0, // Convert to unix timestamp
                    }));
                }
            } else {
                this.logger.log('No MAL ID found for this anime.');
            }
        }

        // 4. Sync to DB
        return this.syncEpisodes(id, episodesData || []);
    }
}

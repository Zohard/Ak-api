import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';
import { AniListService } from '../../anilist/anilist.service';
import { JikanService } from '../../jikan/jikan.service';
import { Inject, forwardRef, NotFoundException } from '@nestjs/common';

@Injectable()
export class EpisodesService {
    private readonly logger = new Logger(EpisodesService.name);

    // Cache TTLs
    private readonly SCHEDULE_CACHE_TTL = 21600; // 6 hours
    private readonly SEASON_SCHEDULE_CACHE_TTL = 21600; // 6 hours

    constructor(
        private readonly prisma: PrismaService,
        private readonly cacheService: CacheService,
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

    async countEpisodes(animeId: number) {
        return this.prisma.akAnimesEpisode.count({ where: { idAnime: animeId } });
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

        const results = await this.prisma.$transaction(async (tx) => {
            const txResults = [];

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
                    txResults.push(updated);
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
                    txResults.push(created);
                }
            }

            return txResults;
        });

        // Clear schedule caches after sync
        if (results.length > 0) {
            this.logger.log(`Clearing schedule caches after syncing ${results.length} episodes for anime ${animeId}`);
            // Clear all schedule caches since episodes changed (we don't know which weeks/seasons are affected)
            await this.cacheService.delByPattern('episodes_schedule:*');
            await this.cacheService.delByPattern('season_episodes_schedule:*');
        }

        return results;
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
            select: { commentaire: true, sources: true, nbEp: true },
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

        // 3.5. Update nb_ep if empty
        if (episodesData && episodesData.length > 0 && (!anime.nbEp || anime.nbEp === 0)) {
            try {
                this.logger.log(`Updating anime ${id} nbEp to ${episodesData.length} (was empty)`);
                await this.prisma.akAnime.update({
                    where: { idAnime: id },
                    data: { nbEp: episodesData.length },
                });
            } catch (e) {
                this.logger.warn(`Failed to update nbEp for anime ${id}: ${e.message}`);
            }
        }

        // 4. Sync to DB
        return this.syncEpisodes(id, episodesData || []);
    }

    private async getAnimeIdsForSeason(seasonId: number): Promise<number[]> {
        const season = await this.prisma.akAnimesSaisons.findUnique({
            where: { idSaison: seasonId },
            select: { jsonData: true },
        });

        if (!season?.jsonData) return [];

        try {
            const jsonData = typeof season.jsonData === 'string'
                ? JSON.parse(season.jsonData)
                : season.jsonData;

            if (Array.isArray(jsonData)) {
                return jsonData;
            } else if (jsonData.animes && Array.isArray(jsonData.animes)) {
                return jsonData.animes;
            } else if (jsonData.anime_ids && Array.isArray(jsonData.anime_ids)) {
                return jsonData.anime_ids;
            }
        } catch (e) {
            this.logger.error(`Error parsing season json_data: ${e.message}`);
        }

        return [];
    }

    async getEpisodesByDate(date: Date) {
        const dateStr = date.toISOString().split('T')[0];

        return this.prisma.akAnimesEpisode.findMany({
            where: {
                dateDiffusion: dateStr,
            },
            include: {
                anime: {
                    select: {
                        idAnime: true,
                        titre: true,
                        image: true,
                        niceUrl: true,
                    }
                }
            }
        });
    }

    async getWeeklySchedule(seasonId?: number, weekStart?: Date, skipCache: boolean = false) {
        // Default to current week (Monday)
        const now = weekStart || new Date();
        const monday = new Date(now);
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
        monday.setHours(0, 0, 0, 0);

        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        const mondayStr = monday.toISOString().split('T')[0];
        const sundayStr = sunday.toISOString().split('T')[0];

        // Check cache first (unless skipCache is true)
        const cacheKey = `episodes_schedule:${seasonId || 'all'}:${mondayStr}`;
        if (!skipCache) {
            const cached = await this.cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }
        }

        // Build base query
        let whereClause: any = {
            dateDiffusion: {
                gte: mondayStr,
                lte: sundayStr,
            },
        };

        // If seasonId provided, filter by animes in that season
        if (seasonId) {
            const animeIds = await this.getAnimeIdsForSeason(seasonId);
            if (animeIds.length === 0) {
                const emptyResult = {
                    weekStart: mondayStr,
                    weekEnd: sundayStr,
                    schedule: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
                    totalEpisodes: 0,
                };
                await this.cacheService.set(cacheKey, emptyResult, this.SCHEDULE_CACHE_TTL);
                return emptyResult;
            }
            whereClause.idAnime = { in: animeIds };
        }

        const episodes = await this.prisma.akAnimesEpisode.findMany({
            where: whereClause,
            include: {
                anime: {
                    select: {
                        idAnime: true,
                        titre: true,
                        image: true,
                        niceUrl: true,
                    },
                },
            },
            orderBy: [
                { dateDiffusion: 'asc' },
                { numero: 'asc' },
            ],
        });

        // Group by day of week
        const schedule: Record<string, any[]> = {
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: [],
        };

        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

        for (const ep of episodes) {
            if (ep.dateDiffusion) {
                // Parse date as noon UTC to avoid timezone day-shift issues
                const date = new Date(ep.dateDiffusion + 'T12:00:00Z');
                const dayName = dayNames[date.getUTCDay()];
                schedule[dayName].push({
                    id: ep.idEpisode,
                    numero: ep.numero,
                    titreJp: ep.titreJp,
                    titreEn: ep.titreEn,
                    image: ep.image,
                    dateDiffusion: ep.dateDiffusion,
                    anime: ep.anime,
                });
            }
        }

        const result = {
            weekStart: mondayStr,
            weekEnd: sundayStr,
            schedule,
            totalEpisodes: episodes.length,
        };

        // Cache the result
        await this.cacheService.set(cacheKey, result, this.SCHEDULE_CACHE_TTL);
        return result;
    }

    async getSeasonEpisodesSchedule(seasonId: number) {
        // Check cache first
        const cacheKey = `season_episodes_schedule:${seasonId}`;
        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        // Get all animes in this season from JSON data
        const animeIds = await this.getAnimeIdsForSeason(seasonId);

        if (animeIds.length === 0) {
            const emptyResult = { episodes: [], animes: [], dateRange: { start: '', end: '' }, totalAnimes: 0, totalEpisodes: 0 };
            await this.cacheService.set(cacheKey, emptyResult, this.SEASON_SCHEDULE_CACHE_TTL);
            return emptyResult;
        }

        // Get all episodes for these animes with future dates
        const episodes = await this.prisma.akAnimesEpisode.findMany({
            where: {
                idAnime: { in: animeIds },
                dateDiffusion: { not: null },
            },
            include: {
                anime: {
                    select: {
                        idAnime: true,
                        titre: true,
                        image: true,
                        niceUrl: true,
                    },
                },
            },
            orderBy: [
                { dateDiffusion: 'asc' },
                { numero: 'asc' },
            ],
        });

        // Get min and max dates for the calendar range
        const dates = episodes
            .map(ep => ep.dateDiffusion)
            .filter(Boolean)
            .map(d => new Date(d as string).getTime());

        const minDate = dates.length ? new Date(Math.min(...dates)) : new Date();
        const maxDate = dates.length ? new Date(Math.max(...dates)) : new Date();

        const result = {
            episodes: episodes.map(ep => ({
                id: ep.idEpisode,
                numero: ep.numero,
                titreJp: ep.titreJp,
                titreEn: ep.titreEn,
                image: ep.image,
                dateDiffusion: ep.dateDiffusion,
                anime: ep.anime,
            })),
            dateRange: {
                start: minDate.toISOString().split('T')[0],
                end: maxDate.toISOString().split('T')[0],
            },
            totalAnimes: animeIds.length,
            totalEpisodes: episodes.length,
        };

        // Cache the result
        await this.cacheService.set(cacheKey, result, this.SEASON_SCHEDULE_CACHE_TTL);
        return result;
    }

    // Method to clear schedule caches (for admin)
    async clearScheduleCaches(seasonId?: number) {
        if (seasonId) {
            // Clear specific season caches
            await this.cacheService.delByPattern(`episodes_schedule:${seasonId}:*`);
            await this.cacheService.del(`season_episodes_schedule:${seasonId}`);
        } else {
            // Clear all schedule caches
            await this.cacheService.delByPattern('episodes_schedule:*');
            await this.cacheService.delByPattern('season_episodes_schedule:*');
        }
    }
}

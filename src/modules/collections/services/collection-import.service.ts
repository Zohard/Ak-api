import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';
import { JikanService } from '../../jikan/jikan.service';
import { CollectionsService } from '../collections.service';
import { ImportMalItemDto } from '../dto/import-mal.dto';

@Injectable()
export class CollectionImportService {
    private readonly logger = new Logger(CollectionImportService.name);

    constructor(
        private prisma: PrismaService,
        private cacheService: CacheService,
        private jikanService: JikanService,
        private collectionsService: CollectionsService,
    ) { }

    // Import from MAL (client-parsed XML -> JSON items)
    async importFromMAL(
        userId: number,
        items: ImportMalItemDto[],
        onProgress?: (processed: number, total: number) => Promise<void>
    ) {
        if (!items?.length) {
            return { success: false, imported: 0, failed: 0, details: [], message: 'No items to import' };
        }

        const results: Array<{ title: string; type: string; status: string; matchedId?: number; outcome: 'imported' | 'updated' | 'skipped' | 'not_found'; reason?: string }> = [];
        const total = items.length;
        let processed = 0;

        // Process sequentially to avoid hammering DB and Jikan rate limits
        for (const raw of items) {
            const type = (raw.type === 'manga' ? 'manga' : 'anime') as 'anime' | 'manga';
            const normalized = this.normalizeMalStatus(raw.status, type);
            const statusName = normalized; // maps to our string names used by addToCollection
            const rating = this.normalizeMalScore(raw.score);

            try {
                // Use enhanced matching with MAL ID when available
                const matchId = await (type === 'anime'
                    ? this.findAnimeIdWithJikan(raw.title, raw.malId)
                    : this.findMangaIdWithJikan(raw.title, raw.malId)
                );

                if (!matchId) {
                    results.push({ title: raw.title, type, status: statusName, outcome: 'not_found', reason: 'Aucun titre correspondant' });
                    processed++;
                    if (onProgress) await onProgress(processed, total);
                    continue;
                }

                // Use existing addToCollection method for upsert-like behavior
                await this.collectionsService.addToCollection(userId, {
                    mediaId: matchId,
                    mediaType: type,
                    type: statusName as any,
                    rating: rating ?? 0,
                } as any);

                results.push({ title: raw.title, type, status: statusName, matchedId: matchId, outcome: 'imported' });
            } catch (err) {
                this.logger.error('MAL import item failed', { title: raw.title, type, err: { message: err?.message, code: err?.code } });
                results.push({ title: raw.title, type, status: statusName, outcome: 'skipped', reason: 'Unexpected error' });
            }

            processed++;
            if (onProgress) await onProgress(processed, total);
        }

        const imported = results.filter(r => r.outcome === 'imported' || r.outcome === 'updated').length;
        const failed = results.filter(r => r.outcome === 'not_found' || r.outcome === 'skipped').length;

        // Invalidate cache once after batch
        await this.invalidateUserCollectionCache(userId);

        return {
            success: true,
            imported,
            failed,
            total: items.length,
            details: results,
        };
    }

    // Export to MAL XML
    async exportToMAL(userId: number, mediaType: 'anime' | 'manga' = 'anime'): Promise<string> {
        const nowTs = Math.floor(Date.now() / 1000);

        if (mediaType === 'anime') {
            const entries = await this.prisma.collectionAnime.findMany({
                where: { idMembre: userId },
                orderBy: { createdAt: 'desc' },
                include: {
                    anime: {
                        select: { idAnime: true, titre: true, nbEp: true, format: true },
                    },
                },
            });

            const itemsXml = entries.map((e) => {
                const status = this.toMalStatus(e.type, 'anime');
                const score10 = Number(e.evaluation ?? 0) * 2; // 0-5 -> 0-10
                const epCount = e.anime?.nbEp ?? 0;
                const seriesType = this.mapFormatToMalType(e.anime?.format);
                return [
                    '  <anime>',
                    `    <series_animedb_id>${e.anime?.idAnime ?? 0}</series_animedb_id>`,
                    `    <series_title>${this.xmlEscape(e.anime?.titre || '')}</series_title>`,
                    `    <series_type>${seriesType}</series_type>`,
                    `    <series_episodes>${epCount}</series_episodes>`,
                    '    <my_id>0</my_id>',
                    '    <my_watched_episodes>0</my_watched_episodes>',
                    '    <my_start_date>0000-00-00</my_start_date>',
                    '    <my_finish_date>0000-00-00</my_finish_date>',
                    `    <my_score>${score10}</my_score>`,
                    `    <my_status>${status}</my_status>`,
                    '    <my_rewatching>0</my_rewatching>',
                    '    <my_rewatching_ep>0</my_rewatching_ep>',
                    '    <my_times_watched>0</my_times_watched>',
                    '    <my_time_watched>0</my_time_watched>',
                    `    <my_last_updated>${nowTs}</my_last_updated>`,
                    '    <my_tags></my_tags>',
                    '  </anime>',
                ].join('\n');
            }).join('\n');

            const xml = [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<myanimelist>',
                '  <myinfo>',
                `    <user_id>${userId}</user_id>`,
                '    <user_name>Anime-Kun</user_name>',
                `    <user_export_type>1</user_export_type>`,
                `    <user_total_anime>${entries.length}</user_total_anime>`,
                `    <user_total_watching>0</user_total_watching>`,
                `    <user_total_completed>0</user_total_completed>`,
                `    <user_total_onhold>0</user_total_onhold>`,
                `    <user_total_dropped>0</user_total_dropped>`,
                `    <user_total_plantowatch>0</user_total_plantowatch>`,
                '  </myinfo>',
                itemsXml,
                '</myanimelist>',
            ].join('\n');
            return xml;
        }

        // manga export
        const entries = await this.prisma.collectionManga.findMany({
            where: { idMembre: userId },
            orderBy: { createdAt: 'desc' },
            include: {
                manga: { select: { idManga: true, titre: true, nbVol: true } },
            },
        });

        const itemsXml = entries.map((e) => {
            const status = this.toMalStatus(e.type, 'manga');
            const score10 = Number(e.evaluation ?? 0) * 2; // 0-5 -> 0-10
            const volCount = e.manga?.nbVol ?? 0;
            return [
                '  <manga>',
                `    <manga_mangadb_id>${e.manga?.idManga ?? 0}</manga_mangadb_id>`,
                `    <manga_title>${this.xmlEscape(e.manga?.titre || '')}</manga_title>`,
                `    <manga_chapters>0</manga_chapters>`,
                `    <manga_volumes>${volCount}</manga_volumes>`,
                '    <my_id>0</my_id>',
                '    <my_read_chapters>0</my_read_chapters>',
                '    <my_read_volumes>0</my_read_volumes>',
                '    <my_start_date>0000-00-00</my_start_date>',
                '    <my_finish_date>0000-00-00</my_finish_date>',
                `    <my_score>${score10}</my_score>`,
                `    <my_status>${status}</my_status>`,
                '    <my_rereadingg>0</my_rereadingg>',
                '    <my_rereading_chap>0</my_rereading_chap>',
                `    <my_last_updated>${nowTs}</my_last_updated>`,
                '    <my_tags></my_tags>',
                '  </manga>',
            ].join('\n');
        }).join('\n');

        const xml = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<myanimelist>',
            '  <myinfo>',
            `    <user_id>${userId}</user_id>`,
            '    <user_name>Anime-Kun</user_name>',
            `    <user_export_type>2</user_export_type>`,
            `    <user_total_manga>${entries.length}</user_total_manga>`,
            '  </myinfo>',
            itemsXml,
            '</myanimelist>',
        ].join('\n');
        return xml;
    }

    private normalizeMalStatus(status: string, type: 'anime' | 'manga'): 'completed' | 'watching' | 'on-hold' | 'dropped' | 'plan-to-watch' {
        const s = (status || '').toLowerCase().replace(/\s+/g, '');
        if (s === 'completed') return 'completed';
        if (s === 'watching' || (type === 'manga' && s === 'reading')) return 'watching';
        if (s === 'onhold' || s === 'on-hold') return 'on-hold';
        if (s === 'dropped') return 'dropped';
        if (s === 'plantowatch' || s === 'plantoread' || s === 'plan-to-watch' || s === 'plan-to-read') return 'plan-to-watch';
        // default to plan-to-watch
        return 'plan-to-watch';
    }

    private normalizeMalScore(score?: number | null): number | undefined {
        if (score == null) return undefined;
        const s = Math.max(0, Math.min(10, Number(score)));
        // Convert to our 0-5 scale (supporting 0.5 increments)
        return s / 2;
    }

    /**
     * Enhanced anime matching using Jikan API for additional titles
     * When MAL ID is available, fetches all titles (English, Japanese, synonyms) from Jikan
     */
    private async findAnimeIdWithJikan(title: string, malId?: number): Promise<number | null> {
        if (!title) return null;

        // First, try simple title match
        const simpleMatch = await this.findAnimeIdByTitle(title);
        if (simpleMatch) return simpleMatch;

        // If we have a MAL ID, use Jikan to get all possible titles
        if (malId) {
            try {
                this.logger.debug(`Fetching Jikan data for anime MAL ID ${malId} to improve matching`);
                const jikanAnime = await this.jikanService.getAnimeById(malId);

                if (jikanAnime) {
                    const allTitles = this.jikanService.getAllAnimeTitles(jikanAnime);
                    this.logger.debug(`Jikan returned ${allTitles.length} titles for MAL ID ${malId}: ${allTitles.join(', ')}`);

                    // Try each title from Jikan
                    for (const jikanTitle of allTitles) {
                        const match = await this.findAnimeIdByTitle(jikanTitle);
                        if (match) {
                            this.logger.debug(`Found match for "${title}" via Jikan title "${jikanTitle}" -> anime ID ${match}`);
                            return match;
                        }
                    }
                }
            } catch (err) {
                this.logger.warn(`Failed to fetch Jikan data for MAL ID ${malId}: ${err.message}`);
            }
        }

        return null;
    }

    /**
     * Enhanced manga matching using Jikan API for additional titles
     */
    private async findMangaIdWithJikan(title: string, malId?: number): Promise<number | null> {
        if (!title) return null;

        // First, try simple title match
        const simpleMatch = await this.findMangaIdByTitle(title);
        if (simpleMatch) return simpleMatch;

        // If we have a MAL ID, use Jikan to get all possible titles
        if (malId) {
            try {
                this.logger.debug(`Fetching Jikan data for manga MAL ID ${malId} to improve matching`);
                const jikanManga = await this.jikanService.getMangaById(malId);

                if (jikanManga) {
                    const allTitles = this.jikanService.getAllMangaTitles(jikanManga);
                    this.logger.debug(`Jikan returned ${allTitles.length} titles for MAL ID ${malId}: ${allTitles.join(', ')}`);

                    // Try each title from Jikan
                    for (const jikanTitle of allTitles) {
                        const match = await this.findMangaIdByTitle(jikanTitle);
                        if (match) {
                            this.logger.debug(`Found match for "${title}" via Jikan title "${jikanTitle}" -> manga ID ${match}`);
                            return match;
                        }
                    }
                }
            } catch (err) {
                this.logger.warn(`Failed to fetch Jikan data for manga MAL ID ${malId}: ${err.message}`);
            }
        }

        return null;
    }

    private async findAnimeIdByTitle(title: string): Promise<number | null> {
        if (!title) return null;
        const t = title.trim();
        // Try exact matches first, then fallback to contains
        // Only match published animes (statut = 1)
        const exact = await this.prisma.executeWithRetry(() =>
            this.prisma.akAnime.findFirst({
                where: {
                    statut: 1, // Only published
                    OR: [
                        { titre: { equals: t, mode: 'insensitive' } as any },
                        { titreFr: { equals: t, mode: 'insensitive' } as any },
                        { titreOrig: { equals: t, mode: 'insensitive' } as any },
                    ],
                },
                select: { idAnime: true },
            })
        );
        if (exact?.idAnime) return exact.idAnime;

        const contains = await this.prisma.executeWithRetry(() =>
            this.prisma.akAnime.findFirst({
                where: {
                    statut: 1, // Only published
                    OR: [
                        { titre: { contains: t, mode: 'insensitive' } as any },
                        { titreFr: { contains: t, mode: 'insensitive' } as any },
                        { titreOrig: { contains: t, mode: 'insensitive' } as any },
                        { titresAlternatifs: { contains: t, mode: 'insensitive' } as any },
                    ],
                },
                select: { idAnime: true },
            })
        );
        return contains?.idAnime || null;
    }

    private async findMangaIdByTitle(title: string): Promise<number | null> {
        if (!title) return null;
        const t = title.trim();
        // Only match published mangas (statut = 1)
        const exact = await this.prisma.executeWithRetry(() =>
            this.prisma.akManga.findFirst({
                where: {
                    statut: 1, // Only published
                    OR: [
                        { titre: { equals: t, mode: 'insensitive' } as any },
                        { titreFr: { equals: t, mode: 'insensitive' } as any },
                        { titreOrig: { equals: t, mode: 'insensitive' } as any },
                    ],
                },
                select: { idManga: true },
            })
        );
        if (exact?.idManga) return exact.idManga;

        const contains = await this.prisma.executeWithRetry(() =>
            this.prisma.akManga.findFirst({
                where: {
                    statut: 1, // Only published
                    OR: [
                        { titre: { contains: t, mode: 'insensitive' } as any },
                        { titreFr: { contains: t, mode: 'insensitive' } as any },
                        { titreOrig: { contains: t, mode: 'insensitive' } as any },
                        { titresAlternatifs: { contains: t, mode: 'insensitive' } as any },
                    ],
                },
                select: { idManga: true },
            })
        );
        return contains?.idManga || null;
    }

    private toMalStatus(typeId: number, media: 'anime' | 'manga'): string {
        switch (typeId) {
            case 1: return 'Completed';
            case 2: return media === 'manga' ? 'Reading' : 'Watching';
            case 3: return media === 'manga' ? 'Plan to Read' : 'Plan to Watch';
            case 4: return 'Dropped';
            case 5: return 'On-Hold';
            default: return media === 'manga' ? 'Plan to Read' : 'Plan to Watch';
        }
    }

    private mapFormatToMalType(format?: string | null): number {
        // MAL types: 1 TV, 2 OVA, 3 Movie, 4 Special, 5 ONA, 6 Music
        const f = (format || '').toLowerCase();
        if (f.includes('tv')) return 1;
        if (f.includes('ova')) return 2;
        if (f.includes('movie') || f.includes('film')) return 3;
        if (f.includes('special')) return 4;
        if (f.includes('ona')) return 5;
        if (f.includes('music')) return 6;
        return 1;
    }

    private xmlEscape(s: string): string {
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    // Helper method to invalidate all collection-related cache for a user
    private async invalidateUserCollectionCache(userId: number): Promise<void> {
        try {
            // Invalidate various cache patterns for the user
            await Promise.all([
                // User collection lists cache
                this.cacheService.delByPattern(`user_collections:${userId}:*`),
                this.cacheService.delByPattern(`user_collections:v2:${userId}:*`),
                // Collection items cache (generic)
                this.cacheService.delByPattern(`collection_items:${userId}:*`),
                // Collection list pages (anime, manga, games)
                this.cacheService.delByPattern(`collection_animes:${userId}:*`),
                this.cacheService.delByPattern(`collection_mangas:${userId}:*`),
                this.cacheService.delByPattern(`collection_games:${userId}:*`),
                this.cacheService.delByPattern(`collection_jeuxvideo:${userId}:*`),
                // Collection check cache (important for real-time status updates)
                this.cacheService.delByPattern(`user_collection_check:${userId}:*`),
                // Ratings distribution cache
                this.cacheService.delByPattern(`collection_ratings:*:${userId}:*`),
                // Find user collections cache (both own and public views)
                this.cacheService.del(`find_user_collections:${userId}:own`),
                this.cacheService.del(`find_user_collections:${userId}:public`),
            ]);
        } catch (error) {
            // Log error but don't throw to avoid breaking the main operation
            this.logger.error('Cache invalidation error for user', userId, error);
        }
    }
}

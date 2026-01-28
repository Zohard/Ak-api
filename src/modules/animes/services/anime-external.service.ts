import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';
import { AniListService } from '../../anilist/anilist.service';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class AnimeExternalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly aniListService: AniListService,
  ) {}

  async searchAniList(query: string, limit = 10) {
    try {
      // Create cache key for AniList search
      const cacheKey = `anilist_search:${this.hashQuery(query)}:${limit}`;

      // Try to get from cache first
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      const results = await this.aniListService.searchAnime(query, limit);
      const result = {
        animes: results,
        total: results.length,
        query,
        source: 'AniList',
      };

      // Cache the result for 2 hours (7200 seconds)
      await this.cacheService.set(cacheKey, result, 7200);

      return result;
    } catch (error) {
      console.error('Error searching AniList:', error.message);
      throw new Error('Failed to search AniList');
    }
  }

  /**
   * Check if an anime exists in the database by titles
   * Uses a single cache key based on all titles combined to reduce key proliferation
   */
  async checkAnimeExists(titles: { romaji?: string; english?: string; native?: string }, anilistId?: number) {
    const titleList = [
      titles.romaji?.toLowerCase(),
      titles.english?.toLowerCase(),
      titles.native?.toLowerCase(),
    ].filter(Boolean);

    // Use AniList ID as cache key if available (most stable), otherwise hash all titles together
    const cacheKey = anilistId
      ? `anime_exists:anilist:${anilistId}`
      : `anime_exists:titles:${this.hashQuery(titleList.sort().join('|'))}`;

    // Try to get from cache first
    const cached = await this.cacheService.get(cacheKey);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    // Not in cache, query database
    const existingAnime = await this.prisma.$queryRaw<Array<{
      id_anime: number;
      titre: string | null;
      titre_orig: string | null;
      titre_fr: string | null;
      titres_alternatifs: string | null;
    }>>`
      SELECT id_anime, titre, titre_orig, titre_fr, titres_alternatifs
      FROM ak_animes
      WHERE LOWER(titre) = ANY(${titleList}::text[])
         OR LOWER(titre_orig) = ANY(${titleList}::text[])
         OR LOWER(titre_fr) = ANY(${titleList}::text[])
         OR EXISTS (
            SELECT 1
            FROM unnest(${titleList}::text[]) t
            WHERE LOWER(ak_animes.titres_alternatifs) LIKE '%' || t || '%'
         )
      LIMIT 1
    `;

    const result = existingAnime.length > 0 ? {
      exists: true,
      existsInDb: true,
      existingAnimeId: existingAnime[0].id_anime,
      dbData: existingAnime[0],
    } : {
      exists: false,
      existsInDb: false,
      existingAnimeId: null,
      dbData: null,
    };

    // Cache with single key (1 hour cache)
    await this.cacheService.set(cacheKey, result, 3600);

    return result;
  }

  /**
   * Invalidate existence cache for specific anime
   * Call this after creating a new anime
   */
  async invalidateAnimeExistsCache(titles: { romaji?: string; english?: string; native?: string; alternatifs?: string[] }, anilistId?: number) {
    // Delete by AniList ID if available
    if (anilistId) {
      await this.cacheService.del(`anime_exists:anilist:${anilistId}`);
    }

    // Also delete by title hash for backwards compatibility
    const titleList = [
      titles.romaji?.toLowerCase(),
      titles.english?.toLowerCase(),
      titles.native?.toLowerCase(),
    ].filter(Boolean);

    if (titleList.length > 0) {
      const cacheKey = `anime_exists:titles:${this.hashQuery(titleList.sort().join('|'))}`;
      await this.cacheService.del(cacheKey);
    }
  }

  async importSeasonalAnimeFromAniList(season: string, year: number, limit = 50) {
    try {
      // Create cache key for seasonal anime data (only AniList data, not existence checks)
      const cacheKey = `anilist_season_data:${season}:${year}:${limit}`;

      // Try to get AniList data from cache first
      let seasonalAnime: any[] = await this.cacheService.get(cacheKey);

      if (!seasonalAnime) {
        seasonalAnime = await this.aniListService.getAnimesBySeason(season, year, limit);
        // Cache AniList data for 1 hour - this won't change
        await this.cacheService.set(cacheKey, seasonalAnime, 3600);
      }

      // Check existence for each anime individually (uses per-anime cache with AniList ID)
      const comparisons: any[] = [];

      for (const anilistAnime of seasonalAnime) {
        const primaryTitle = anilistAnime.title.romaji || anilistAnime.title.english || anilistAnime.title.native;

        // Check existence using AniList ID as cache key (1 key per anime instead of 3)
        const existenceCheck: any = await this.checkAnimeExists(anilistAnime.title, anilistAnime.id);

        const comparison = {
          titre: primaryTitle,
          exists: existenceCheck.exists,
          existsInDb: existenceCheck.existsInDb,
          existingAnimeId: existenceCheck.existingAnimeId,
          dbData: existenceCheck.dbData,
          anilistData: anilistAnime,
        };

        comparisons.push(comparison);
      }

      return {
        season,
        year,
        total: seasonalAnime.length,
        comparisons,
        source: 'AniList',
      };
    } catch (error) {
      console.error('Error importing seasonal anime from AniList:', error.message);
      throw new Error('Failed to import seasonal anime from AniList');
    }
  }

  private hashQuery(query: string): string {
    return crypto.createHash('md5').update(query).digest('hex');
  }
}


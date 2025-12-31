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

  async importSeasonalAnimeFromAniList(season: string, year: number, limit = 50) {
    try {
      // Create cache key for seasonal anime data
      const cacheKey = `anilist_season:${season}:${year}:${limit}`;

      // Try to get from cache first (full result cached for 5 minutes)
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      const seasonalAnime = await this.aniListService.getAnimesBySeason(season, year, limit);

      // OPTIMIZATION: Batch query all existing animes in one go instead of N queries
      const allTitles: string[] = [];
      seasonalAnime.forEach(anime => {
        if (anime.title.romaji) allTitles.push(anime.title.romaji.toLowerCase());
        if (anime.title.english) allTitles.push(anime.title.english.toLowerCase());
        if (anime.title.native) allTitles.push(anime.title.native.toLowerCase());
      });

      const existingAnimes = await this.prisma.$queryRaw<Array<{
        id_anime: number;
        titre: string | null;
        titre_orig: string | null;
        titre_fr: string | null;
        titres_alternatifs: string | null;
      }>>`
        SELECT id_anime, titre, titre_orig, titre_fr, titres_alternatifs
        FROM ak_animes
        WHERE LOWER(titre) = ANY(${allTitles}::text[])
           OR LOWER(titre_orig) = ANY(${allTitles}::text[])
           OR LOWER(titre_fr) = ANY(${allTitles}::text[])
      `;

      // Build a fast lookup map: normalized title -> anime data
      const titleToAnimeMap = new Map<string, typeof existingAnimes[0]>();
      existingAnimes.forEach(anime => {
        if (anime.titre) titleToAnimeMap.set(anime.titre.toLowerCase(), anime);
        if (anime.titre_orig) titleToAnimeMap.set(anime.titre_orig.toLowerCase(), anime); 
        if (anime.titre_fr) titleToAnimeMap.set(anime.titre_fr.toLowerCase(), anime);      
      
        // Also index alternative titles
        if (anime.titres_alternatifs) {                                                  
          anime.titres_alternatifs.split('\n').forEach(alt => {                         
            if (alt.trim()) titleToAnimeMap.set(alt.toLowerCase().trim(), anime);
          });
        }
      });

      // Now process comparisons using the in-memory map (no DB queries!)
      const comparisons: any[] = [];

      for (const anilistAnime of seasonalAnime) {
        const primaryTitle = anilistAnime.title.romaji || anilistAnime.title.english || anilistAnime.title.native;

        // Check if anime exists using cached map (O(1) lookup)
        let existingAnime = null;
        if (anilistAnime.title.romaji) {
          existingAnime = titleToAnimeMap.get(anilistAnime.title.romaji.toLowerCase());
        }
        if (!existingAnime && anilistAnime.title.english) {
          existingAnime = titleToAnimeMap.get(anilistAnime.title.english.toLowerCase());
        }
        if (!existingAnime && anilistAnime.title.native) {
          existingAnime = titleToAnimeMap.get(anilistAnime.title.native.toLowerCase());
        }

        const comparison = {
          titre: primaryTitle,
          exists: !!existingAnime,           // ⚠️ Check if you're using 'exists' or 'existsInDb'
          existsInDb: !!existingAnime,     
          existingAnimeId: existingAnime?.id_anime || null,  /
          dbData: existingAnime || null,
          anilistData: anilistAnime,
        };

        comparisons.push(comparison);
      }

      const result = {
        season,
        year,
        total: seasonalAnime.length,
        comparisons,
        source: 'AniList',
      };

      // Cache the result for 1 hour (3600 seconds) - increased from 5 minutes
      // Season data doesn't change frequently, so we can cache longer
      await this.cacheService.set(cacheKey, result, 3600);

      return result;
    } catch (error) {
      console.error('Error importing seasonal anime from AniList:', error.message);
      throw new Error('Failed to import seasonal anime from AniList');
    }
  }

  private hashQuery(query: string): string {
    return crypto.createHash('md5').update(query).digest('hex');
  }
}




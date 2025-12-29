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

      // Try to get from cache first
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      const seasonalAnime = await this.aniListService.getAnimesBySeason(season, year, limit);

      const comparisons: any[] = [];

      for (const anilistAnime of seasonalAnime) {
        const primaryTitle = anilistAnime.title.romaji || anilistAnime.title.english || anilistAnime.title.native;

        const orConditions: any[] = [];

        if (primaryTitle) {
          orConditions.push({ titre: { equals: primaryTitle, mode: Prisma.QueryMode.insensitive } });
          orConditions.push({ titresAlternatifs: { contains: primaryTitle, mode: Prisma.QueryMode.insensitive } });
        }

        if (anilistAnime.title.native) {
          orConditions.push({ titreOrig: { equals: anilistAnime.title.native, mode: Prisma.QueryMode.insensitive } });
          orConditions.push({ titresAlternatifs: { contains: anilistAnime.title.native, mode: Prisma.QueryMode.insensitive } });
        }

        if (anilistAnime.title.english) {
          orConditions.push({ titreFr: { equals: anilistAnime.title.english, mode: Prisma.QueryMode.insensitive } });
          orConditions.push({ titresAlternatifs: { contains: anilistAnime.title.english, mode: Prisma.QueryMode.insensitive } });
        }

        const existingAnime = await this.prisma.akAnime.findFirst({
          where: {
            OR: orConditions,
          },
          select: {
            idAnime: true,
            titre: true,
            titreOrig: true,
            titreFr: true,
            titresAlternatifs: true,
          },
        });

        const comparison = {
          titre: primaryTitle,
          exists: !!existingAnime,
          existingAnimeId: existingAnime?.idAnime,
          anilistData: anilistAnime,
          scrapedData: this.aniListService.mapToCreateAnimeDto(anilistAnime),
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

      // Cache the result for 5 minutes (300 seconds)
      await this.cacheService.set(cacheKey, result, 300);

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

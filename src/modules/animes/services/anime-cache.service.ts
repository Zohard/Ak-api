import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';
import { AnimeQueryDto } from '../dto/anime-query.dto';

@Injectable()
export class AnimeCacheService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) { }

  createCacheKey(query: AnimeQueryDto): string {
    const {
      page = 1,
      limit = 20,
      search = '',
      studio = '',
      annee = '',
      statut = '',
      format = '',
      genre = [],
      sortBy = 'dateAjout',
      sortOrder = 'desc',
      includeReviews = false,
      includeEpisodes = false,
    } = query;

    const genreKey = Array.isArray(genre) ? genre.sort().join(',') : (genre || '');
    return `${page}_${limit}_${search}_${studio}_${annee}_${statut}_${format}_${genreKey}_${sortBy}_${sortOrder}_${includeReviews}_${includeEpisodes}`;
  }

  async invalidateAnimeCache(id: number): Promise<void> {
    await this.cacheService.invalidateAnime(id);
    // Also invalidate related caches
    await this.cacheService.invalidateSearchCache();
    // Invalidate rankings as anime updates may affect top/flop lists
    await this.cacheService.invalidateRankings('anime');

    // Invalidate specific endpoint caches for this anime
    await Promise.all([
      this.cacheService.del(`anime_staff:${id}`),
      this.cacheService.del(`anime_relations:${id}`),
      this.cacheService.del(`anime_articles:${id}`),
      this.cacheService.del(`similar_animes:${id}:6`), // Default limit is 6
      this.cacheService.invalidateHomepageStats(), // Invalidate homepage stats (anime count)
      this.cacheService.invalidateHomepageSeason(), // Invalidate homepage season (anime details might have changed)
    ]);

    // Invalidate cache of all related animes (when image changes, related pages must refresh)
    try {
      // Get relations where this anime is source or target
      const relations = await this.prisma.$queryRaw<Array<{ id_fiche_depart: string; id_anime: number; id_manga: number }>>`
        SELECT id_fiche_depart, id_anime, id_manga
        FROM ak_fiche_to_fiche
        WHERE id_fiche_depart = ${`anime${id}`} OR id_anime = ${id}
      `;

      // Collect all related anime IDs
      const relatedAnimeIds = new Set<number>();

      for (const relation of relations) {
        // Case 1: This anime is source - check if target is an anime
        if (relation.id_fiche_depart === `anime${id}` && relation.id_anime && relation.id_anime > 0) {
          relatedAnimeIds.add(relation.id_anime);
        }
        // Case 2: This anime is target - check if source is an anime
        else if (relation.id_anime === id) {
          const ficheMatch = relation.id_fiche_depart?.match(/^anime(\d+)$/);
          if (ficheMatch) {
            relatedAnimeIds.add(parseInt(ficheMatch[1]));
          }
        }
      }

      // Invalidate cache for each related anime
      if (relatedAnimeIds.size > 0) {
        await Promise.all(
          Array.from(relatedAnimeIds).map(relatedId => this.cacheService.invalidateAnime(relatedId))
        );

      }
    } catch (error) {
      console.error(`Failed to invalidate related animes cache for anime ${id}:`, error);
    }
  }

  hashQuery(query: string): string {
    // Simple hash function for query strings
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

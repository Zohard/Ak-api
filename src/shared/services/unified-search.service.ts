import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CacheService } from './cache.service';

export interface SearchResult {
  id: number;
  title: string;
  type: 'anime' | 'manga' | 'jeu_video';
  year?: number;
  image?: string;
  author?: string;
  studio?: string;
  rating?: number;
  synopsis?: string;
  plateforme?: string;
  editeur?: string;
}

export interface UnifiedSearchQuery {
  query: string;
  type?: 'anime' | 'manga' | 'jeu_video' | 'all';
  limit?: number;
  minRating?: number;
  yearFrom?: number;
  yearTo?: number;
  genre?: string;
  sortBy?: 'relevance' | 'rating' | 'date' | 'title';
  sortOrder?: 'asc' | 'desc';
  tags?: string[];
  status?: 'ongoing' | 'completed' | 'all';
  plateforme?: string;
  editeur?: string;
}

@Injectable()
export class UnifiedSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async search(searchQuery: UnifiedSearchQuery): Promise<{
    results: SearchResult[];
    total: number;
    breakdown: { animes: number; mangas: number; jeuxVideo: number };
    searchTime: number;
    suggestions?: string[];
  }> {
    const startTime = Date.now();

    // Create cache key from search parameters
    const cacheKey = this.createSearchCacheKey(searchQuery);

    // Try to get from cache first
    const cached = await this.cacheService.getSearchResult(cacheKey, 'unified');
    if (cached) {
      return {
        ...cached,
        searchTime: Date.now() - startTime, // Update search time
      };
    }

    const {
      query,
      type = 'all',
      limit = 20,
      minRating = 0,
      yearFrom,
      yearTo,
      genre,
      sortBy = 'relevance',
      sortOrder = 'desc',
      tags,
      status,
      plateforme,
      editeur,
    } = searchQuery;

    const searchConditions = this.buildSearchConditions(
      query,
      minRating,
      yearFrom,
      yearTo,
    );

    const promises: Promise<any[]>[] = [];

    if (type === 'all' || type === 'anime') {
      promises.push(this.searchAnimes(searchConditions, limit));
    }

    if (type === 'all' || type === 'manga') {
      promises.push(this.searchMangas(searchConditions, limit));
    }

    if (type === 'all' || type === 'jeu_video') {
      const jeuVideoConditions = this.buildJeuVideoSearchConditions(
        query,
        minRating,
        yearFrom,
        yearTo,
        plateforme,
        editeur,
      );
      promises.push(this.searchJeuxVideo(jeuVideoConditions, limit));
    }

    const results = await Promise.all(promises);

    let animeResults: any[] = [];
    let mangaResults: any[] = [];
    let jeuVideoResults: any[] = [];

    if (type === 'all') {
      animeResults = results[0] || [];
      mangaResults = results[1] || [];
      jeuVideoResults = results[2] || [];
    } else if (type === 'anime') {
      animeResults = results[0] || [];
    } else if (type === 'manga') {
      mangaResults = results[0] || [];
    } else if (type === 'jeu_video') {
      jeuVideoResults = results[0] || [];
    }

    // Enhanced result formatting
    const combinedResults = [
      ...animeResults.map((anime) => this.formatAnimeResult(anime)),
      ...mangaResults.map((manga) => this.formatMangaResult(manga)),
      ...jeuVideoResults.map((jeu) => this.formatJeuVideoResult(jeu)),
    ];

    // Apply sorting based on sortBy parameter
    let sortedResults = combinedResults;
    if (sortBy === 'rating') {
      sortedResults = combinedResults.sort(
        (a, b) => (b.rating || 0) - (a.rating || 0),
      );
    } else if (sortBy === 'title') {
      sortedResults = combinedResults.sort((a, b) =>
        a.title.localeCompare(b.title),
      );
    } else if (sortBy === 'date') {
      sortedResults = combinedResults.sort(
        (a, b) => (b.year || 0) - (a.year || 0),
      );
    }

    if (sortOrder === 'asc') {
      sortedResults = sortedResults.reverse();
    }

    const finalResults = sortedResults.slice(0, limit);
    const searchTime = Date.now() - startTime;

    const result = {
      results: finalResults,
      total: finalResults.length,
      breakdown: {
        animes: animeResults.length,
        mangas: mangaResults.length,
        jeuxVideo: jeuVideoResults.length,
      },
      searchTime,
    };

    // Cache the result (shorter TTL for search results)
    await this.cacheService.setSearchResult(cacheKey, 'unified', result, 180); // 3 minutes

    return result;
  }

  async getRecommendations(
    basedOnId: number,
    type: 'anime' | 'manga' | 'jeu_video',
    limit = 10,
  ): Promise<SearchResult[]> {
    // Get the base item to understand its characteristics
    let baseItem;

    if (type === 'anime') {
      baseItem = await this.prisma.akAnime.findUnique({
        where: { idAnime: basedOnId },
      });
    } else if (type === 'manga') {
      baseItem = await this.prisma.akManga.findUnique({
        where: { idManga: basedOnId },
      });
    } else if (type === 'jeu_video') {
      baseItem = await this.prisma.akJeuxVideo.findFirst({
        where: { idJeu: basedOnId },
      });
    }

    if (!baseItem) {
      return [];
    }

    // Since genre field doesn't exist, fallback to top-rated items
    return this.getTopRated(type, limit);
  }

  private async getTopRated(
    type: 'anime' | 'manga' | 'jeu_video',
    limit: number,
  ): Promise<SearchResult[]> {
    if (type === 'anime') {
      const animes = await this.prisma.executeWithRetry(() =>
        this.prisma.akAnime.findMany({
          where: { statut: 1 },
          orderBy: { dateAjout: 'desc' },
          take: limit,
        })
      );
      return animes.map(this.formatAnimeResult.bind(this));
    } else if (type === 'manga') {
      const mangas = await this.prisma.executeWithRetry(() =>
        this.prisma.akManga.findMany({
          where: { statut: 1 },
          orderBy: { dateAjout: 'desc' },
          take: limit,
        })
      );
      return mangas.map(this.formatMangaResult.bind(this));
    } else {
      const jeux = await this.prisma.executeWithRetry(() =>
        this.prisma.akJeuxVideo.findMany({
          where: { statut: 1 },
          orderBy: { dateAjout: 'desc' },
          take: limit,
        })
      );
      return jeux.map(this.formatJeuVideoResult.bind(this));
    }
  }

  private buildSearchConditions(
    query: string,
    minRating: number,
    yearFrom?: number,
    yearTo?: number,
  ) {
    const conditions: any = {
      statut: 1,
      OR: [
        { titre: { contains: query, mode: 'insensitive' } },
        { synopsis: { contains: query, mode: 'insensitive' } },
      ],
    };

    if (minRating > 0) {
      conditions.moyenneNotes = { gte: minRating };
    }

    if (yearFrom || yearTo) {
      conditions.annee = {};
      if (yearFrom) conditions.annee.gte = yearFrom;
      if (yearTo) conditions.annee.lte = yearTo;
    }

    return conditions;
  }

  private buildJeuVideoSearchConditions(
    query: string,
    minRating: number,
    yearFrom?: number,
    yearTo?: number,
    plateforme?: string,
    editeur?: string,
  ) {
    const conditions: any = {
      statut: 1,
      OR: [
        { titre: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    };

    if (minRating > 0) {
      conditions.moyenneNotes = { gte: minRating };
    }

    if (yearFrom || yearTo) {
      conditions.annee = {};
      if (yearFrom) conditions.annee.gte = yearFrom;
      if (yearTo) conditions.annee.lte = yearTo;
    }

    if (plateforme) {
      conditions.plateforme = { contains: plateforme, mode: 'insensitive' };
    }

    if (editeur) {
      conditions.editeur = { contains: editeur, mode: 'insensitive' };
    }

    return conditions;
  }

  private async searchAnimes(conditions: any, limit: number) {
    return this.prisma.executeWithRetry(() =>
      this.prisma.akAnime.findMany({
        where: conditions,
        orderBy: [{ dateAjout: 'desc' }],
        take: Math.ceil(limit / 3), // Split limit between types
      })
    );
  }

  private async searchMangas(conditions: any, limit: number) {
    return this.prisma.akManga.findMany({
      where: conditions,
      orderBy: [{ dateAjout: 'desc' }],
      take: Math.ceil(limit / 3), // Split limit between types
    });
  }

  private async searchJeuxVideo(conditions: any, limit: number) {
    return this.prisma.akJeuxVideo.findMany({
      where: conditions,
      orderBy: [{ dateAjout: 'desc' }],
      take: Math.ceil(limit / 3), // Split limit between types
    });
  }

  private formatAnimeResult(anime: any): SearchResult {
    return {
      id: anime.idAnime,
      title: anime.titre,
      type: 'anime',
      year: anime.annee,
      image: anime.image,
      studio: anime.studio,
      rating: anime.moyenneNotes,
      synopsis:
        anime.synopsis?.substring(0, 200) +
        (anime.synopsis?.length > 200 ? '...' : ''),
    };
  }

  private formatMangaResult(manga: any): SearchResult {
    return {
      id: manga.idManga,
      title: manga.titre,
      type: 'manga',
      year: manga.annee,
      image: manga.image,
      author: manga.auteur,
      rating: manga.moyenneNotes,
      synopsis:
        manga.synopsis?.substring(0, 200) +
        (manga.synopsis?.length > 200 ? '...' : ''),
    };
  }

  private formatJeuVideoResult(jeu: any): SearchResult {
    return {
      id: jeu.idJeu,
      title: jeu.titre,
      type: 'jeu_video',
      year: jeu.annee,
      image: jeu.image,
      plateforme: jeu.plateforme,
      editeur: jeu.editeur,
      rating: jeu.moyenneNotes,
      synopsis:
        jeu.description?.substring(0, 200) +
        (jeu.description?.length > 200 ? '...' : ''),
    };
  }

  // Enhanced autocomplete method
  async getAutocomplete(
    query: string,
    type: 'anime' | 'manga' | 'jeu_video' | 'all' = 'all',
    limit = 10,
  ): Promise<string[]> {
    // Try cache first
    const cacheKey = `autocomplete_${query}_${type}_${limit}`;
    const cached = await this.cacheService.get<string[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const suggestions: string[] = [];
    const itemsPerType = type === 'all' ? Math.ceil(limit / 3) : limit;

    try {
      if (type === 'all' || type === 'anime') {
        const animeTitles = await this.prisma.executeWithRetry(() =>
          this.prisma.akAnime.findMany({
            where: {
              titre: { contains: query, mode: 'insensitive' },
              statut: 1,
            },
            select: { titre: true },
            take: itemsPerType,
            orderBy: { moyenneNotes: 'desc' },
          })
        );
        suggestions.push(...animeTitles.map((a) => a.titre).filter((t): t is string => t !== null));
      }

      if (type === 'all' || type === 'manga') {
        const mangaTitles = await this.prisma.akManga.findMany({
          where: {
            titre: { contains: query, mode: 'insensitive' },
            statut: 1,
          },
          select: { titre: true },
          take: itemsPerType,
          orderBy: { moyenneNotes: 'desc' },
        });
        suggestions.push(...mangaTitles.map((m) => m.titre).filter((t): t is string => t !== null));
      }

      if (type === 'all' || type === 'jeu_video') {
        const jeuTitles = await this.prisma.akJeuxVideo.findMany({
          where: {
            titre: { contains: query, mode: 'insensitive' },
            statut: 1,
          },
          select: { titre: true },
          take: itemsPerType,
          orderBy: { moyenneNotes: 'desc' },
        });
        suggestions.push(...jeuTitles.map((j) => j.titre).filter((t): t is string => t !== null));
      }
    } catch (error) {
      console.warn('Failed to get autocomplete suggestions:', error.message);
    }

    const result = suggestions.slice(0, limit);

    // Cache autocomplete results for 5 minutes
    await this.cacheService.set(cacheKey, result, 300);

    return result;
  }

  // Get popular search terms
  async getPopularSearches(
    limit = 10,
  ): Promise<Array<{ query: string; count: number }>> {
    try {
      const popular = await this.prisma.$queryRaw`
          SELECT query, COUNT(*) as count
          FROM search_analytics
          WHERE timestamp >= NOW() - INTERVAL '30 days'
          GROUP BY query
          ORDER BY count DESC
              LIMIT ${limit}
      `;

      return (popular as any[]).map((p) => ({
        query: p.query,
        count: Number(p.count),
      }));
    } catch (error) {
      console.warn('Failed to get popular searches:', error.message);
      return [];
    }
  }

  // Get search analytics
  async getSearchAnalytics(): Promise<{
    totalSearches: number;
    uniqueQueries: number;
    avgSearchTime: number;
    topSearches: Array<{ query: string; count: number }>;
  }> {
    try {
      const stats = await this.prisma.$queryRaw`
          SELECT
              COUNT(*) as total_searches,
              COUNT(DISTINCT query) as unique_queries,
              AVG(search_time) as avg_search_time
          FROM search_analytics
          WHERE timestamp >= NOW() - INTERVAL '30 days'
      `;

      const topSearches = await this.getPopularSearches(5);

      const result = (stats as any[])[0];

      return {
        totalSearches: Number(result.total_searches),
        uniqueQueries: Number(result.unique_queries),
        avgSearchTime: Number(result.avg_search_time || 0),
        topSearches,
      };
    } catch (error) {
      console.warn('Failed to get search analytics:', error.message);
      return {
        totalSearches: 0,
        uniqueQueries: 0,
        avgSearchTime: 0,
        topSearches: [],
      };
    }
  }

  // Helper method to create cache keys for search
  private createSearchCacheKey(searchQuery: UnifiedSearchQuery): string {
    const {
      query = '',
      type = 'all',
      limit = 20,
      minRating = 0,
      yearFrom = '',
      yearTo = '',
      genre = '',
      sortBy = 'relevance',
      sortOrder = 'desc',
      tags = [],
      status = 'all',
      plateforme = '',
      editeur = '',
    } = searchQuery;

    return `search_${query}_${type}_${limit}_${minRating}_${yearFrom}_${yearTo}_${genre}_${sortBy}_${sortOrder}_${tags.join(',')}_${status}_${plateforme}_${editeur}`;
  }
}
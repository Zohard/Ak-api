import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface SearchResult {
  id: number;
  title: string;
  type: 'anime' | 'manga';
  year?: number;
  image?: string;
  author?: string;
  studio?: string;
  rating?: number;
  synopsis?: string;
}

export interface UnifiedSearchQuery {
  query: string;
  type?: 'anime' | 'manga' | 'all';
  limit?: number;
  minRating?: number;
  yearFrom?: number;
  yearTo?: number;
  genre?: string;
  sortBy?: 'relevance' | 'rating' | 'date' | 'title';
  sortOrder?: 'asc' | 'desc';
  tags?: string[];
  status?: 'ongoing' | 'completed' | 'all';
}

@Injectable()
export class UnifiedSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(searchQuery: UnifiedSearchQuery): Promise<{
    results: SearchResult[];
    total: number;
    breakdown: { animes: number; mangas: number };
    searchTime: number;
    suggestions?: string[];
  }> {
    const startTime = Date.now();

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

    const results = await Promise.all(promises);

    const animeResults = type === 'manga' ? [] : results[0] || [];
    const mangaResults =
      type === 'anime' ? [] : results[type === 'all' ? 1 : 0] || [];

    // Enhanced result formatting
    const combinedResults = [
      ...animeResults.map((anime) => this.formatAnimeResult(anime)),
      ...mangaResults.map((manga) => this.formatMangaResult(manga)),
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
    }

    if (sortOrder === 'asc') {
      sortedResults = sortedResults.reverse();
    }

    const finalResults = sortedResults.slice(0, limit);
    const searchTime = Date.now() - startTime;

    return {
      results: finalResults,
      total: finalResults.length,
      breakdown: {
        animes: animeResults.length,
        mangas: mangaResults.length,
      },
      searchTime,
    };
  }

  async getRecommendations(
    basedOnId: number,
    type: 'anime' | 'manga',
    limit = 10,
  ): Promise<SearchResult[]> {
    // Get the base item to understand its characteristics
    const baseItem =
      type === 'anime'
        ? await this.prisma.akAnime.findUnique({
            where: { idAnime: basedOnId },
          })
        : await this.prisma.akManga.findUnique({
            where: { idManga: basedOnId },
          });

    if (!baseItem) {
      return [];
    }

    // Since genre field doesn't exist, fallback to top-rated items
    return this.getTopRated(type, limit);
  }

  private async getTopRated(
    type: 'anime' | 'manga',
    limit: number,
  ): Promise<SearchResult[]> {
    if (type === 'anime') {
      const animes = await this.prisma.akAnime.findMany({
        where: { statut: 1 },
        orderBy: { dateAjout: 'desc' },
        take: limit,
      });
      return animes.map(this.formatAnimeResult.bind(this));
    } else {
      const mangas = await this.prisma.akManga.findMany({
        where: { statut: 1 },
        orderBy: { dateAjout: 'desc' },
        take: limit,
      });
      return mangas.map(this.formatMangaResult.bind(this));
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

  private async searchAnimes(conditions: any, limit: number) {
    return this.prisma.akAnime.findMany({
      where: conditions,
      orderBy: [{ dateAjout: 'desc' }],
      take: Math.ceil(limit / 2), // Split limit between animes and mangas
    });
  }

  private async searchMangas(conditions: any, limit: number) {
    return this.prisma.akManga.findMany({
      where: conditions,
      orderBy: [{ dateAjout: 'desc' }],
      take: Math.ceil(limit / 2), // Split limit between animes and mangas
    });
  }

  private async countAnimes(conditions: any): Promise<number> {
    return this.prisma.akAnime.count({ where: conditions });
  }

  private async countMangas(conditions: any): Promise<number> {
    return this.prisma.akManga.count({ where: conditions });
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

  private buildOrderBy(
    sortBy: string,
    sortOrder: string,
    type: 'anime' | 'manga',
  ) {
    const direction = sortOrder === 'asc' ? 'asc' : 'desc';

    switch (sortBy) {
      case 'rating':
        return { moyenneNotes: direction };
      case 'date':
        return { dateAjout: direction };
      case 'title':
        return { titre: direction };
      case 'relevance':
      default:
        return { dateAjout: 'desc' }; // Default to most recent
    }
  }

  private applySorting(
    results: SearchResult[],
    sortBy: string,
    sortOrder: string,
  ): SearchResult[] {
    const direction = sortOrder === 'asc' ? 1 : -1;

    switch (sortBy) {
      case 'rating':
        return results.sort(
          (a, b) => ((b.rating || 0) - (a.rating || 0)) * direction,
        );
      case 'title':
        return results.sort(
          (a, b) => a.title.localeCompare(b.title) * direction,
        );
      case 'year':
        return results.sort(
          (a, b) => ((b.year || 0) - (a.year || 0)) * direction,
        );
      case 'relevance':
      default:
        return results; // Already sorted by database query
    }
  }

  private async logSearchQuery(searchQuery: UnifiedSearchQuery): Promise<void> {
    try {
      // Log search queries for analytics
      await this.prisma.$executeRaw`
        INSERT INTO search_analytics (query, type, filters, timestamp)
        VALUES (${searchQuery.query}, ${searchQuery.type || 'all'}, ${JSON.stringify(searchQuery)}, NOW())
      `;
    } catch (error) {
      // Fail silently for analytics
      console.warn('Failed to log search query:', error.message);
    }
  }

  private async generateSuggestions(
    query: string,
    type?: string,
  ): Promise<string[]> {
    try {
      // Simple suggestion system based on similar titles
      const suggestions = await this.prisma.$queryRaw`
        SELECT DISTINCT titre
        FROM (
          SELECT titre FROM ak_animes WHERE titre ILIKE ${'%' + query + '%'} AND statut = 1
          UNION ALL
          SELECT titre FROM ak_mangas WHERE titre ILIKE ${'%' + query + '%'} AND statut = 1
        ) as combined
        WHERE titre != ${query}
        ORDER BY titre
        LIMIT 5
      `;

      return (suggestions as any[]).map((s) => s.titre);
    } catch (error) {
      console.warn('Failed to generate suggestions:', error.message);
      return [];
    }
  }

  // Enhanced autocomplete method
  async getAutocomplete(
    query: string,
    type: 'anime' | 'manga' | 'all' = 'all',
    limit = 10,
  ): Promise<string[]> {
    const suggestions: string[] = [];

    try {
      if (type === 'all' || type === 'anime') {
        const animeTitles = await this.prisma.akAnime.findMany({
          where: {
            titre: { contains: query, mode: 'insensitive' },
            statut: 1,
          },
          select: { titre: true },
          take: Math.ceil(limit / (type === 'all' ? 2 : 1)),
          orderBy: { moyenneNotes: 'desc' },
        });
        suggestions.push(...animeTitles.map((a) => a.titre));
      }

      if (type === 'all' || type === 'manga') {
        const mangaTitles = await this.prisma.akManga.findMany({
          where: {
            titre: { contains: query, mode: 'insensitive' },
            statut: 1,
          },
          select: { titre: true },
          take: Math.ceil(limit / (type === 'all' ? 2 : 1)),
          orderBy: { moyenneNotes: 'desc' },
        });
        suggestions.push(...mangaTitles.map((m) => m.titre));
      }
    } catch (error) {
      console.warn('Failed to get autocomplete suggestions:', error.message);
    }

    return suggestions.slice(0, limit);
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
}

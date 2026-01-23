import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface JikanAnime {
  mal_id: number;
  url: string;
  images: {
    jpg: {
      image_url: string;
      small_image_url: string;
      large_image_url: string;
    };
    webp: {
      image_url: string;
      small_image_url: string;
      large_image_url: string;
    };
  };
  title: string;
  title_english?: string;
  title_japanese?: string;
  title_synonyms?: string[];
  titles?: Array<{ type: string; title: string }>;
  type: string;
  episodes?: number;
  status: string;
  year?: number;
}

export interface JikanManga {
  mal_id: number;
  url: string;
  images: {
    jpg: {
      image_url: string;
      small_image_url: string;
      large_image_url: string;
    };
    webp: {
      image_url: string;
      small_image_url: string;
      large_image_url: string;
    };
  };
  title: string;
  title_english?: string;
  title_japanese?: string;
  title_synonyms?: string[];
  titles?: Array<{ type: string; title: string }>;
  type: string;
  chapters?: number;
  volumes?: number;
  status: string;
  year?: number;
}

export interface JikanSearchResult {
  data: JikanAnime[];
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
    current_page: number;
    items: {
      count: number;
      total: number;
      per_page: number;
    };
  };
}

@Injectable()
export class JikanService {
  private readonly logger = new Logger(JikanService.name);
  private readonly httpClient: AxiosInstance;
  private readonly baseUrl = 'https://api.jikan.moe/v4';
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_DELAY = 1000; // 1 second between requests (Jikan rate limit)

  constructor() {
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Rate limiting to respect Jikan's API limits (1 request per second)
   */
  private async rateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_REQUEST_DELAY) {
      await new Promise(resolve => setTimeout(resolve, this.MIN_REQUEST_DELAY - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Search for anime by title
   */
  async searchAnime(query: string, limit = 5): Promise<JikanAnime[]> {
    try {
      await this.rateLimit();

      const response = await this.httpClient.get<JikanSearchResult>('/anime', {
        params: {
          q: query,
          limit: limit,
          order_by: 'popularity',
          sort: 'asc',
        },
      });

      if (!response.data || !response.data.data) {
        this.logger.warn('Jikan API returned no data');
        return [];
      }

      return response.data.data;
    } catch (error: any) {
      this.logger.error('Error searching anime on Jikan:', error.message);
      return [];
    }
  }

  /**
   * Get anime by MAL ID
   */
  async getAnimeById(malId: number): Promise<JikanAnime | null> {
    try {
      await this.rateLimit();

      const response = await this.httpClient.get<{ data: JikanAnime }>(`/anime/${malId}`);

      if (!response.data || !response.data.data) {
        this.logger.warn(`Jikan API returned no data for MAL ID ${malId}`);
        return null;
      }

      return response.data.data;
    } catch (error: any) {
      this.logger.error(`Error fetching anime from Jikan (MAL ID: ${malId}):`, error.message);
      return null;
    }
  }

  /**
   * Find best matching anime by title and optionally year
   * Returns the anime with the best image quality
   */
  async findBestMatch(title: string, year?: number): Promise<JikanAnime | null> {
    const results = await this.searchAnime(title, 10);

    if (results.length === 0) {
      return null;
    }

    // Filter by year if provided
    let filtered = results;
    if (year) {
      const yearFiltered = results.filter(anime => anime.year === year);
      if (yearFiltered.length > 0) {
        filtered = yearFiltered;
      }
    }

    // Normalize title for comparison
    const normalizeTitle = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedQuery = normalizeTitle(title);

    // Find exact or closest match
    let bestMatch = filtered[0]; // Default to first result (most popular)
    let bestScore = 0;

    for (const anime of filtered) {
      let score = 0;

      // Check title match
      const titleMatch = normalizeTitle(anime.title) === normalizedQuery;
      const englishMatch = anime.title_english && normalizeTitle(anime.title_english) === normalizedQuery;
      const japaneseMatch = anime.title_japanese && normalizeTitle(anime.title_japanese) === normalizedQuery;

      if (titleMatch || englishMatch || japaneseMatch) {
        score += 100; // Exact match
      } else if (
        normalizeTitle(anime.title).includes(normalizedQuery) ||
        (anime.title_english && normalizeTitle(anime.title_english).includes(normalizedQuery))
      ) {
        score += 50; // Partial match
      }

      // Prefer TV shows over other formats
      if (anime.type === 'TV') {
        score += 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = anime;
      }
    }

    return bestMatch;
  }

  /**
   * Get episodes by MAL ID
   * Automatically handles pagination to fetch all episodes
   */
  async getEpisodes(malId: number): Promise<any[]> {
    try {
      let page = 1;
      let hasNextPage = true;
      const allEpisodes: any[] = [];

      while (hasNextPage) {
        await this.rateLimit();

        const response = await this.httpClient.get(`/anime/${malId}/episodes`, {
          params: { page }
        });

        if (!response.data || !response.data.data) {
          break;
        }

        allEpisodes.push(...response.data.data);

        hasNextPage = response.data.pagination?.has_next_page || false;
        page++;

        // Safety break
        if (page > 20) break;
      }

      return allEpisodes;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.warn(`Episodes not found for MAL ID ${malId}`);
        return [];
      }
      this.logger.error(`Error fetching episodes from Jikan (MAL ID: ${malId}):`, error.message);
      return [];
    }
  }

  /**
   * Get the best quality image URL from a Jikan anime
   */
  getBestImageUrl(anime: JikanAnime): string {
    // Prefer WebP large image, then JPG large image, then fallback to smaller versions
    return (
      anime.images?.webp?.large_image_url ||
      anime.images?.jpg?.large_image_url ||
      anime.images?.webp?.image_url ||
      anime.images?.jpg?.image_url ||
      ''
    );
  }

  /**
   * Get manga by MAL ID
   */
  async getMangaById(malId: number): Promise<JikanManga | null> {
    try {
      await this.rateLimit();

      const response = await this.httpClient.get<{ data: JikanManga }>(`/manga/${malId}`);

      if (!response.data || !response.data.data) {
        this.logger.warn(`Jikan API returned no data for manga MAL ID ${malId}`);
        return null;
      }

      return response.data.data;
    } catch (error: any) {
      this.logger.error(`Error fetching manga from Jikan (MAL ID: ${malId}):`, error.message);
      return null;
    }
  }

  /**
   * Search for manga by title
   */
  async searchManga(query: string, limit = 5): Promise<JikanManga[]> {
    try {
      await this.rateLimit();

      const response = await this.httpClient.get<{ data: JikanManga[]; pagination: any }>('/manga', {
        params: {
          q: query,
          limit: limit,
          order_by: 'popularity',
          sort: 'asc',
        },
      });

      if (!response.data || !response.data.data) {
        this.logger.warn('Jikan API returned no manga data');
        return [];
      }

      return response.data.data;
    } catch (error: any) {
      this.logger.error('Error searching manga on Jikan:', error.message);
      return [];
    }
  }

  /**
   * Get all possible titles for an anime (for better matching)
   * Returns: main title, english, japanese, and all synonyms
   */
  getAllAnimeTitles(anime: JikanAnime): string[] {
    const titles: string[] = [];

    if (anime.title) titles.push(anime.title);
    if (anime.title_english) titles.push(anime.title_english);
    if (anime.title_japanese) titles.push(anime.title_japanese);

    // Add synonyms
    if (anime.title_synonyms && Array.isArray(anime.title_synonyms)) {
      titles.push(...anime.title_synonyms);
    }

    // Add titles from the titles array (newer Jikan format)
    if (anime.titles && Array.isArray(anime.titles)) {
      for (const t of anime.titles) {
        if (t.title && !titles.includes(t.title)) {
          titles.push(t.title);
        }
      }
    }

    // Return unique, non-empty titles
    return [...new Set(titles.filter(t => t && t.trim()))];
  }

  /**
   * Get all possible titles for a manga (for better matching)
   */
  getAllMangaTitles(manga: JikanManga): string[] {
    const titles: string[] = [];

    if (manga.title) titles.push(manga.title);
    if (manga.title_english) titles.push(manga.title_english);
    if (manga.title_japanese) titles.push(manga.title_japanese);

    // Add synonyms
    if (manga.title_synonyms && Array.isArray(manga.title_synonyms)) {
      titles.push(...manga.title_synonyms);
    }

    // Add titles from the titles array (newer Jikan format)
    if (manga.titles && Array.isArray(manga.titles)) {
      for (const t of manga.titles) {
        if (t.title && !titles.includes(t.title)) {
          titles.push(t.title);
        }
      }
    }

    // Return unique, non-empty titles
    return [...new Set(titles.filter(t => t && t.trim()))];
  }
}

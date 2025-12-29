import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis;

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL;
    
    if (redisUrl) {
      this.logger.log('🔧 Initializing Redis connection');
      this.redis = new Redis(redisUrl, {
        tls: { rejectUnauthorized: false },
        maxRetriesPerRequest: 3,
        connectTimeout: 10000,
        lazyConnect: true
      });
      
      this.redis.on('connect', () => this.logger.log('✅ Redis connected'));
      this.redis.on('error', (err) => this.logger.error('❌ Redis error:', err));
      
      this.logger.log('🚀 CacheService initialized with Redis');
    } else {
      this.logger.warn('⚠️  No REDIS_URL found - caching disabled');
    }
  }

  // Generic get method
  async get<T>(key: string): Promise<T | undefined> {
    if (!this.redis) return undefined;
    
    try {
      this.logger.log(`🔍 Checking cache for key: ${key}`);
      const value = await this.redis.get(key);
      if (value) {
        this.logger.log(`✅ Cache HIT for key: ${key}`);
        return JSON.parse(value) as T;
      } else {
        this.logger.log(`❌ Cache MISS for key: ${key}`);
        return undefined;
      }
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}:`, error);
      return undefined;
    }
  }

  // Generic set method
  async set<T>(key: string, value: T, ttl: number = 300): Promise<void> {
    if (!this.redis) return;
    
    try {
      this.logger.log(`💾 Attempting to cache key: ${key}, TTL: ${ttl}s`);
      const serialized = JSON.stringify(value);
      await this.redis.setex(key, ttl, serialized);
      this.logger.log(`✅ Successfully cached key: ${key}`);
    } catch (error) {
      this.logger.error(`❌ Cache set error for key ${key}:`, error);
    }
  }

  // Delete specific key
  async del(key: string): Promise<void> {
    if (!this.redis) return;
    
    try {
      await this.redis.del(key);
      this.logger.debug(`Cache deleted for key: ${key}`);
    } catch (error) {
      this.logger.error(`Cache delete error for key ${key}:`, error);
    }
  }

  // Clear cache by pattern (useful for invalidating related keys)
  async delByPattern(pattern: string): Promise<void> {
    if (!this.redis) return;
    
    try {
      this.logger.debug(`Cache pattern delete requested for: ${pattern}`);
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.debug(`Deleted ${keys.length} keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      this.logger.error(`Cache pattern delete error for pattern ${pattern}:`, error);
    }
  }

  // Anime-specific cache methods
  async getAnime(id: number): Promise<any> {
    return this.get(`anime:${id}`);
  }

  async setAnime(id: number, anime: any, ttl = 600): Promise<void> {
    await this.set(`anime:${id}`, anime, ttl); // 10 minutes
  }

  async getAnimeList(key: string): Promise<any> {
    return this.get(`anime_list:${key}`);
  }

  async setAnimeList(key: string, animes: any, ttl = 300): Promise<void> {
    await this.set(`anime_list:${key}`, animes, ttl); // 5 minutes
  }

  // Manga-specific cache methods
  async getManga(id: number): Promise<any> {
    return this.get(`manga:${id}`);
  }

  async setManga(id: number, manga: any, ttl = 600): Promise<void> {
    await this.set(`manga:${id}`, manga, ttl); // 10 minutes
  }

  async getMangaList(key: string): Promise<any> {
    return this.get(`manga_list:${key}`);
  }

  async setMangaList(key: string, mangas: any, ttl = 300): Promise<void> {
    await this.set(`manga_list:${key}`, mangas, ttl); // 5 minutes
  }

  // User collections cache methods
  async getUserCollections(userId: number, key: string): Promise<any> {
    return this.get(`user_collections:${userId}:${key}`);
  }

  async setUserCollections(userId: number, key: string, data: any, ttl = 300): Promise<void> {
    await this.set(`user_collections:${userId}:${key}`, data, ttl); // 5 minutes
  }

  async invalidateUserCollections(userId: number): Promise<void> {
    await this.delByPattern(`user_collections:${userId}:*`);
  }

  // Search cache methods
  async getSearchResult(query: string, type: string): Promise<any> {
    const key = `search:${type}:${this.hashQuery(query)}`;
    return this.get(key);
  }

  async setSearchResult(query: string, type: string, result: any, ttl = 180): Promise<void> {
    const key = `search:${type}:${this.hashQuery(query)}`;
    await this.set(key, result, ttl); // 3 minutes for search results
  }

  // Top/popular content cache
  async getTopContent(type: string, limit: number): Promise<any> {
    return this.get(`top:${type}:${limit}`);
  }

  async setTopContent(type: string, limit: number, content: any, ttl = 900): Promise<void> {
    await this.set(`top:${type}:${limit}`, content, ttl); // 15 minutes
  }

  // Rankings cache methods (1 hour TTL)
  async getRankings(mediaType: 'anime' | 'manga', rankingType: 'top' | 'flop', type: string, limit: number): Promise<any> {
    return this.get(`rankings:${mediaType}:${rankingType}:${type}:${limit}`);
  }

  async setRankings(mediaType: 'anime' | 'manga', rankingType: 'top' | 'flop', type: string, limit: number, content: any, ttl = 3600): Promise<void> {
    await this.set(`rankings:${mediaType}:${rankingType}:${type}:${limit}`, content, ttl); // 1 hour
  }

  async invalidateRankings(mediaType: 'anime' | 'manga'): Promise<void> {
    await this.delByPattern(`rankings:${mediaType}:*`);
    this.logger.debug(`Invalidated rankings cache for ${mediaType}`);
  }

  // Lists cache methods
  async getPublicLists(mediaType: string, sort: string, limit: number): Promise<any> {
    return this.get(`lists:${mediaType}:${sort}:${limit}`);
  }

  async setPublicLists(mediaType: string, sort: string, limit: number, lists: any, ttl = 14400): Promise<void> {
    await this.set(`lists:${mediaType}:${sort}:${limit}`, lists, ttl); // 4 hours (14400 seconds)
  }

  // Reviews cache
  async getReviews(animeId: number, mangaId: number): Promise<any> {
    const id = animeId || mangaId;
    const type = animeId ? 'anime' : 'manga';
    return this.get(`reviews:${type}:${id}`);
  }

  async setReviews(animeId: number, mangaId: number, reviews: any, ttl = 300): Promise<void> {
    const id = animeId || mangaId;
    const type = animeId ? 'anime' : 'manga';
    await this.set(`reviews:${type}:${id}`, reviews, ttl); // 5 minutes
  }

  // Invalidation methods
  async invalidateAnime(id: number): Promise<void> {
    await Promise.all([
      this.del(`anime:${id}`),
      this.del(`reviews:anime:${id}`),
    ]);
  }

  async invalidateManga(id: number): Promise<void> {
    await Promise.all([
      this.del(`manga:${id}`),
      this.del(`reviews:manga:${id}`),
    ]);
  }

  async invalidateSearchCache(): Promise<void> {
    // In a full Redis implementation, we'd use SCAN to find and delete search:* keys
    this.logger.debug('Search cache invalidation requested');
  }

  // Paginated lists cache methods
  async getPublicListsPaged(mediaType: string, sort: string, type: string, page: number, limit: number): Promise<any> {
    const key = `lists_paged:${mediaType}:${sort}:${type || 'all'}:${page}:${limit}`;
    return this.get(key);
  }

  async setPublicListsPaged(mediaType: string, sort: string, type: string, page: number, limit: number, lists: any, ttl = 300): Promise<void> {
    const key = `lists_paged:${mediaType}:${sort}:${type || 'all'}:${page}:${limit}`;
    await this.set(key, lists, ttl); // 5 minutes
  }

  async invalidatePublicLists(mediaType: 'anime' | 'manga'): Promise<void> {
    // Invalidate all cached public lists for this media type
    await Promise.all([
      this.delByPattern(`lists:${mediaType}:*`),
      this.delByPattern(`lists_paged:${mediaType}:*`)
    ]);
    this.logger.debug(`Invalidated public lists cache for ${mediaType}`);
  }

  // Utility method to create consistent cache keys
  private hashQuery(query: string): string {
    // Simple hash function for query strings
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Homepage-specific cache methods
  async getHomepageData(key: string): Promise<any> {
    const value = await this.get(`homepage:${key}`);
    try {
      if (this.isEmptyHomepagePayload(value)) {
        this.logger.warn(`🚫 Ignoring cached empty payload for homepage:${key}`);
        return undefined;
      }
    } catch (e) {
      // If validation fails, return the value to avoid accidental cache misses
      this.logger.warn(
        `⚠️  Homepage payload validation error on get: ${(e as Error).message}`
      );
    }
    return value;
  }

  async setHomepageData(key: string, data: any, ttl = 1800): Promise<void> {
    // Do not cache empty/minimal homepage payloads
    try {
      const isEmpty = this.isEmptyHomepagePayload(data);
      if (isEmpty) {
        this.logger.warn(
          `⏭️  Skipping cache for homepage:${key} — payload considered empty`
        );
        return;
      }
    } catch (e) {
      // If validation throws, log and proceed with caching to avoid false negatives
      this.logger.warn(
        `⚠️  Homepage payload validation error, proceeding to cache: ${(e as Error).message}`
      );
    }

    await this.set(`homepage:${key}`, data, ttl); // 30 minutes default for homepage data
  }

  // Heuristic to determine if homepage payload is "empty" and not worth caching
  private isEmptyHomepagePayload(payload: any): boolean {
    if (!payload || typeof payload !== 'object') return true;

    const heroReviews = Array.isArray(payload?.hero?.reviews)
      ? payload.hero.reviews.length
      : 0;
    const heroArticles = Array.isArray(payload?.hero?.articles)
      ? payload.hero.articles.length
      : 0;
    const seasonAnimes = Array.isArray(payload?.season?.animes)
      ? payload.season.animes.length
      : 0;
    const forumMessages = Array.isArray(payload?.forum?.messages)
      ? payload.forum.messages.length
      : 0;

    const stats = payload?.stats || {};
    const statAnimes = Number(stats?.animes || 0);
    const statMangas = Number(stats?.mangas || 0);
    const statReviews = Number(stats?.reviews || 0);

    // Consider payload empty if no lists have items AND all stats are zero
    const hasAnyListItems =
      heroReviews > 0 || heroArticles > 0 || seasonAnimes > 0 || forumMessages > 0;
    const allStatsZero = statAnimes === 0 && statMangas === 0 && statReviews === 0;

    return !hasAnyListItems && allStatsZero;
  }

  // Articles cache methods
  async getArticlesList(key: string): Promise<any> {
    return this.get(`articles_list:${key}`);
  }

  async setArticlesList(key: string, articles: any, ttl = 600): Promise<void> {
    await this.set(`articles_list:${key}`, articles, ttl); // 10 minutes for articles lists
  }

  async getArticle(id: number): Promise<any> {
    return this.get(`article:${id}`);
  }

  async setArticle(id: number, article: any, ttl = 1800): Promise<void> {
    await this.set(`article:${id}`, article, ttl); // 30 minutes for individual articles
  }

  async getArticleBySlug(slug: string): Promise<any> {
    return this.get(`article_slug:${slug}`);
  }

  async setArticleBySlug(slug: string, article: any, ttl = 1800): Promise<void> {
    await this.set(`article_slug:${slug}`, article, ttl); // 30 minutes for articles by slug
  }

  async getFeaturedArticles(): Promise<any> {
    return this.get('featured_articles');
  }

  async setFeaturedArticles(articles: any, ttl = 3600): Promise<void> {
    await this.set('featured_articles', articles, ttl); // 1 hour for featured articles
  }

  async invalidateArticle(id: number): Promise<void> {
    await Promise.all([
      this.del(`article:${id}`),
      this.delByPattern(`articles_list:*`), // Invalidate all article lists
      this.del('featured_articles'), // Invalidate featured articles
    ]);
    this.logger.debug(`Invalidated article cache for ID: ${id}`);
  }

  // Events cache methods
  async getEvent(id: number): Promise<any> {
    return this.get(`event:${id}`);
  }

  async setEvent(id: number, event: any, ttl = 300): Promise<void> {
    await this.set(`event:${id}`, event, ttl); // 5 minutes for individual events
  }

  async getEventsList(key: string): Promise<any> {
    return this.get(`events:${key}`);
  }

  async setEventsList(key: string, events: any, ttl = 300): Promise<void> {
    await this.set(`events:${key}`, events, ttl); // 5 minutes for events lists
  }

  async invalidateEvent(id: number): Promise<void> {
    await Promise.all([
      this.del(`event:${id}`),
      this.delByPattern(`events:*`), // Invalidate all events lists
    ]);
    this.logger.debug(`Invalidated event cache for ID: ${id}`);
  }

  async invalidateAllEvents(): Promise<void> {
    await this.delByPattern(`events:*`);
    this.logger.debug('Invalidated all events cache');
  }

  // Health check method
  async isHealthy(): Promise<boolean> {
    if (!this.redis) return false;

    try {
      const testKey = 'health_check';
      const testValue = Date.now().toString();
      await this.set(testKey, testValue, 10);
      const retrieved = await this.get(testKey);
      await this.del(testKey);
      return retrieved === testValue;
    } catch (error) {
      this.logger.error('Cache health check failed:', error);
      return false;
    }
  }

  // Admin cache management methods
  async getAllKeys(pattern: string = '*'): Promise<string[]> {
    if (!this.redis) return [];

    try {
      const keys = await this.redis.keys(pattern);
      return keys;
    } catch (error) {
      this.logger.error(`Error getting keys with pattern ${pattern}:`, error);
      return [];
    }
  }

  async getKeysByCategory(): Promise<Record<string, string[]>> {
    const categories = {
      anime: 'anime:*',
      manga: 'manga:*',
      game: 'game:*',
      business: 'business:*',
      homepage: 'homepage:*',
      season: 'season:*',
      articles: 'article*',
      reviews: 'reviews:*',
      search: 'search:*',
      rankings: 'rankings:*',
      lists: 'lists*',
      collections: 'user_collections:*',
      top: 'top:*',
      events: 'events:*'
    };

    const result: Record<string, string[]> = {};
    const categorizedKeys = new Set<string>();

    // Get keys for each specific category
    for (const [category, pattern] of Object.entries(categories)) {
      const keys = await this.getAllKeys(pattern);
      result[category] = keys;
      // Track all categorized keys
      keys.forEach(key => categorizedKeys.add(key));
    }

    // Get "other" keys - only those not matching any specific category
    const allKeys = await this.getAllKeys('*');
    result['other'] = allKeys.filter(key => !categorizedKeys.has(key));

    return result;
  }

  async getCacheStats(): Promise<{
    totalKeys: number;
    categoryCounts: Record<string, number>;
    memoryUsage?: string;
  }> {
    if (!this.redis) {
      return { totalKeys: 0, categoryCounts: {} };
    }

    try {
      const keysByCategory = await this.getKeysByCategory();
      const categoryCounts: Record<string, number> = {};
      let totalKeys = 0;

      for (const [category, keys] of Object.entries(keysByCategory)) {
        const count = keys.length;
        categoryCounts[category] = count;
        totalKeys += count;
      }

      // Get memory info
      let memoryUsage: string | undefined;
      try {
        const info = await this.redis.info('memory');
        const match = info.match(/used_memory_human:([^\r\n]+)/);
        if (match) {
          memoryUsage = match[1];
        }
      } catch (err) {
        this.logger.warn('Could not fetch memory usage');
      }

      return {
        totalKeys,
        categoryCounts,
        memoryUsage
      };
    } catch (error) {
      this.logger.error('Error getting cache stats:', error);
      return { totalKeys: 0, categoryCounts: {} };
    }
  }

  async clearCacheByCategory(category: string): Promise<number> {
    const patterns: Record<string, string> = {
      anime: 'anime:*',
      manga: 'manga:*',
      game: 'game:*',
      business: 'business:*',
      homepage: 'homepage:*',
      season: 'season:*',
      articles: 'article*',
      reviews: 'reviews:*',
      search: 'search:*',
      rankings: 'rankings:*',
      lists: 'lists*',
      collections: 'user_collections:*',
      top: 'top:*',
      events: 'events:*',
      all: '*'
    };

    const pattern = patterns[category];
    if (!pattern) {
      throw new Error(`Unknown cache category: ${category}`);
    }

    if (!this.redis) return 0;

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.log(`✅ Cleared ${keys.length} keys for category: ${category}`);
        return keys.length;
      }
      return 0;
    } catch (error) {
      this.logger.error(`Error clearing cache for category ${category}:`, error);
      throw error;
    }
  }
}

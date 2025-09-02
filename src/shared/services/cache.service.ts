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
}
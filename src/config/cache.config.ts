import { CacheModuleOptions } from '@nestjs/cache-manager';
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

export const cacheConfig = (): CacheModuleOptions => {
  const redisUrl = process.env.REDIS_URL;
  
  console.log('🔧 Cache Config - Redis URL:', redisUrl ? 'Present' : 'Missing');

  if (redisUrl) {
    console.log('🔧 Cache Config - Using Keyv Redis store');
    // Create Keyv instance with Redis
    const keyv = new Keyv({
      store: new KeyvRedis(redisUrl),
      ttl: 300000, // 5 minutes in milliseconds
    });
    
    return {
      store: keyv as any,
      ttl: 300000, // 5 minutes default TTL in milliseconds
      max: 1000, // Maximum number of items in cache
    };
  } else {
    console.log('🔧 Cache Config - Using in-memory cache (no Redis URL)');
    // Development: Use in-memory cache
    return {
      ttl: 300000, // 5 minutes in milliseconds
      max: 100, // Maximum number of items in cache
    };
  }
};
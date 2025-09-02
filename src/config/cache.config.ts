// Cache config is now handled directly in CacheService using ioredis
// This file is kept for compatibility but not used
export const cacheConfig = () => ({
  ttl: 300000, // 5 minutes default TTL in milliseconds
  max: 1000, // Maximum number of items in cache
});
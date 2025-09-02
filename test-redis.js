const Redis = require('ioredis');

const redis = new Redis('redis://default:AUotAAIncDE3YjI4MjFiZDY1ZDg0YzljYTEwZTIwNWU4OTVmNjQ0M3AxMTg5ODk@real-gator-18989.upstash.io:6379', {
  tls: {
    rejectUnauthorized: false
  },
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  connectTimeout: 10000,
  lazyConnect: true
});

async function testRedis() {
  try {
    console.log('Connecting to Redis...');
    
    // Test connection
    const pong = await redis.ping();
    console.log('Ping response:', pong);
    
    // Get all keys
    const keys = await redis.keys('*');
    console.log('All keys in Redis:', keys);
    console.log('Total keys count:', keys.length);
    
    // Check for all possible key patterns
    const patterns = [
      'anime*',           // Direct anime keys
      'manga*',           // Direct manga keys
      '*anime*',          // Contains anime
      '*manga*',          // Contains manga
      '*list*',           // Contains list
    ];
    
    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        console.log(`Keys matching '${pattern}':`, keys);
      }
    }
    
    // If there are keys, let's see some values
    if (keys.length > 0) {
      for (const key of keys.slice(0, 5)) { // Show first 5 keys
        const type = await redis.type(key);
        console.log(`\nKey: ${key} (Type: ${type})`);
        
        if (type === 'string') {
          const value = await redis.get(key);
          console.log('Value:', value?.substring(0, 200) + (value?.length > 200 ? '...' : ''));
        }
      }
    }
    
    // Test cache set/get
    console.log('\nTesting cache operations...');
    await redis.set('test:health_check', JSON.stringify({ timestamp: new Date().toISOString() }), 'EX', 60);
    const testValue = await redis.get('test:health_check');
    console.log('Test cache value:', testValue);
    
    redis.disconnect();
  } catch (error) {
    console.error('Redis test failed:', error);
    redis.disconnect();
  }
}

testRedis();
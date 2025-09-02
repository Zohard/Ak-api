const { Keyv } = require('keyv');
const Redis = require('ioredis');

async function testKeyvKeys() {
  const redis = new Redis('redis://default:AUotAAIncDE3YjI4MjFiZDY1ZDg0YzljYTEwZTIwNWU4OTVmNjQ0M3AxMTg5ODk@real-gator-18989.upstash.io:6379', {
    tls: { rejectUnauthorized: false }
  });
  
  const keyv = new Keyv('redis://default:AUotAAIncDE3YjI4MjFiZDY1ZDg0YzljYTEwZTIwNWU4OTVmNjQ0M3AxMTg5ODk@real-gator-18989.upstash.io:6379', {
    ttl: 60000 // 1 minute
  });
  
  console.log('Before Keyv operations:');
  let keys = await redis.keys('*');
  console.log('Keys:', keys);
  
  console.log('\nSetting Keyv key...');
  await keyv.set('anime_list:test', { data: 'test cache' });
  
  console.log('\nImmediately after Keyv set:');
  keys = await redis.keys('*');
  console.log('All keys:', keys);
  
  // Check specific patterns
  const patterns = ['*anime*', '*test*', '*keyv*', '*namespace*'];
  for (const pattern of patterns) {
    const patternKeys = await redis.keys(pattern);
    if (patternKeys.length > 0) {
      console.log(`Pattern '${pattern}':`, patternKeys);
      // Show first key content
      const value = await redis.get(patternKeys[0]);
      console.log(`Value:`, value?.substring(0, 100));
    }
  }
  
  redis.disconnect();
  await keyv.disconnect();
}

testKeyvKeys().catch(console.error);
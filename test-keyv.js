const { Keyv } = require('keyv');

async function testKeyv() {
  try {
    console.log('Testing Keyv with Redis...');
    
    // Create Keyv instance with Redis URL (Keyv will auto-detect Redis)
    const keyv = new Keyv('redis://default:AUotAAIncDE3YjI4MjFiZDY1ZDg0YzljYTEwZTIwNWU4OTVmNjQ0M3AxMTg5ODk@real-gator-18989.upstash.io:6379', {
      ttl: 300000, // 5 minutes
    });
    
    // Test basic operations
    console.log('Setting test key...');
    await keyv.set('test_keyv', { message: 'Hello from Keyv', timestamp: new Date() });
    
    console.log('Getting test key...');
    const value = await keyv.get('test_keyv');
    console.log('Retrieved value:', value);
    
    // Test cache service style keys
    await keyv.set('anime_list:1_20___1__dateAjout_desc_false_false', {
      test: 'anime list cache',
      timestamp: new Date()
    });
    
    console.log('Keyv test completed successfully');
    
  } catch (error) {
    console.error('Keyv test failed:', error);
  }
}

testKeyv();
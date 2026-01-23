import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => {
    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
        try {
            const parsed = new URL(redisUrl);
            const isUpstash = parsed.hostname.includes('upstash.io');
            // Upstash always requires TLS, even if URL says redis://
            const requiresTls = parsed.protocol === 'rediss:' || isUpstash;

            console.log(`🔧 Redis config: host=${parsed.hostname}, port=${parsed.port}, tls=${requiresTls}, upstash=${isUpstash}`);

            return {
                host: parsed.hostname,
                port: parseInt(parsed.port, 10) || 6379,
                password: decodeURIComponent(parsed.password) || undefined,
                username: decodeURIComponent(parsed.username) || undefined,
                tls: requiresTls ? { rejectUnauthorized: false } : undefined,
                url: redisUrl,
                isUpstash,
            };
        } catch (e) {
            console.warn('⚠️ Invalid REDIS_URL provided, falling back to defaults');
        }
    }

    return {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        tls: undefined,
        url: undefined,
        isUpstash: false,
    };
});

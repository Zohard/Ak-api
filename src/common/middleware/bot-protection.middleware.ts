import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Bot Protection Middleware
 *
 * Blocks known bad bots, empty user-agents, and applies aggressive
 * IP-based rate limiting to prevent database exhaustion from bot traffic.
 */

// Known bad bot / scraper user-agent patterns
const BAD_BOT_PATTERNS = [
  // Scraping tools
  /python-requests/i,
  /scrapy/i,
  /httpclient/i,
  /java\//i,
  /libwww-perl/i,
  /wget/i,
  /curl/i,
  /php\//i,
  /go-http-client/i,
  /node-fetch/i,
  /axios/i,
  /undici/i,
  /httpie/i,
  /postman/i,
  /insomnia/i,
  // SEO / aggressive crawlers
  /semrush/i,
  /ahrefs/i,
  /mj12bot/i,
  /dotbot/i,
  /blexbot/i,
  /seekport/i,
  /megaindex/i,
  /serpstatbot/i,
  /zoominfobot/i,
  /dataforseo/i,
  /censys/i,
  /netcraftsurvey/i,
  /masscan/i,
  /zgrab/i,
  // AI crawlers (aggressive)
  /claudebot/i,
  /gptbot/i,
  /chatgpt-user/i,
  /ccbot/i,
  /anthropic-ai/i,
  /cohere-ai/i,
  /bytespider/i,
  /petalbot/i,
  /amazonbot/i,
  // Generic bad patterns
  /bot\/\d/i,
  /spider\/\d/i,
  /crawl\/\d/i,
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
];

// Good bots we want to ALLOW (Google, Bing, etc.)
const GOOD_BOT_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /yandexbot/i,
  /duckduckbot/i,
  /baiduspider/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /discordbot/i,
  /telegrambot/i,
  /whatsapp/i,
  /slackbot/i,
  /applebot/i,
  /uptimerobot/i,
];

interface RateLimitEntry {
  count: number;
  firstRequest: number;
  blocked: boolean;
  blockedUntil: number;
}

@Injectable()
export class BotProtectionMiddleware implements NestMiddleware {
  private readonly logger = new Logger('BotProtection');
  private readonly ipStore = new Map<string, RateLimitEntry>();

  // Rate limit config: max requests per window
  private readonly WINDOW_MS = 1_000; // 1 second
  private readonly MAX_REQUESTS = 200; // 200 requests per second per IP
  private readonly BLOCK_DURATION_MS = 60_000; // Block for 1 minute if exceeded
  private readonly CLEANUP_INTERVAL_MS = 120_000; // Clean old entries every 2 min

  constructor() {
    // Periodic cleanup of expired entries
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL_MS);
  }

  use(req: Request, res: Response, next: NextFunction) {
    const ua = req.headers['user-agent'] || '';
    const ip = this.getClientIp(req);

    // 1. Block empty user-agents (almost always bots)
    if (!ua || ua.trim() === '') {
      res.status(403).json({ statusCode: 403, message: 'Forbidden' });
      return;
    }

    // 2. Allow known good bots (search engines, social media)
    if (GOOD_BOT_PATTERNS.some((pattern) => pattern.test(ua))) {
      next();
      return;
    }

    // 3. Block known bad bots
    if (BAD_BOT_PATTERNS.some((pattern) => pattern.test(ua))) {
      this.logger.debug(`Blocked bad bot: ${ua.substring(0, 80)} from ${ip}`);
      res.status(403).json({ statusCode: 403, message: 'Forbidden' });
      return;
    }

    // 4. IP-based rate limiting (skip if we can't identify a unique real IP)
    if (ip && ip !== '0.0.0.0' && ip !== '127.0.0.1' && this.isRateLimited(ip)) {
      res.status(429).json({
        statusCode: 429,
        message: 'Too Many Requests',
        retryAfter: Math.ceil(this.BLOCK_DURATION_MS / 1000),
      });
      return;
    }

    next();
  }

  private isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = this.ipStore.get(ip);

    // Check if currently blocked
    if (entry?.blocked) {
      if (now < entry.blockedUntil) {
        return true;
      }
      // Block expired, reset
      this.ipStore.delete(ip);
    }

    if (!entry || now - entry.firstRequest > this.WINDOW_MS) {
      // New window
      this.ipStore.set(ip, {
        count: 1,
        firstRequest: now,
        blocked: false,
        blockedUntil: 0,
      });
      return false;
    }

    entry.count++;

    if (entry.count > this.MAX_REQUESTS) {
      // Exceeded limit — block this IP
      entry.blocked = true;
      entry.blockedUntil = now + this.BLOCK_DURATION_MS;
      this.logger.warn(
        `Rate limited IP ${ip}: ${entry.count} requests in ${this.WINDOW_MS}ms window`,
      );
      return true;
    }

    return false;
  }

  private getClientIp(req: Request): string {
    // Cloudflare sets this to the real client IP
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp) {
      return (typeof cfIp === 'string' ? cfIp : cfIp[0]).trim();
    }

    // Standard reverse proxy header
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = typeof forwarded === 'string' ? forwarded : forwarded[0];
      return ips.split(',')[0].trim();
    }

    // Railway / nginx real IP
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return (typeof realIp === 'string' ? realIp : realIp[0]).trim();
    }

    return req.ip || req.socket?.remoteAddress || '0.0.0.0';
  }

  private cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [ip, entry] of this.ipStore) {
      const isExpiredWindow =
        !entry.blocked && now - entry.firstRequest > this.WINDOW_MS;
      const isExpiredBlock = entry.blocked && now > entry.blockedUntil;
      if (isExpiredWindow || isExpiredBlock) {
        this.ipStore.delete(ip);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`Cleaned ${cleaned} expired rate limit entries`);
    }
  }
}

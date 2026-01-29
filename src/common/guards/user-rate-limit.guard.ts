import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

/**
 * Rate limit configuration metadata key
 */
export const RATE_LIMIT_KEY = 'rateLimit';

/**
 * Rate limit configuration interface
 */
export interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests per window */
  max: number;
  /** Use user ID for authenticated requests (default: true) */
  useUserId?: boolean;
  /** Custom key prefix */
  keyPrefix?: string;
}

/**
 * Decorator to apply rate limiting to a route
 * @example @RateLimit({ windowMs: 60000, max: 10 })
 */
export function RateLimit(config: RateLimitConfig): MethodDecorator & ClassDecorator {
  return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata(RATE_LIMIT_KEY, config, descriptor.value);
      return descriptor;
    }
    Reflect.defineMetadata(RATE_LIMIT_KEY, config, target);
    return target;
  };
}

/**
 * In-memory rate limit store
 * For production, consider using Redis for distributed rate limiting
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * Enhanced rate limit guard that uses user ID + IP for authenticated requests
 * This prevents a single user from bypassing rate limits by using multiple IPs
 * and prevents a single IP from affecting multiple users
 */
@Injectable()
export class UserRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(UserRateLimitGuard.name);
  private readonly store = new Map<string, RateLimitEntry>();

  // Cleanup old entries every 5 minutes
  private readonly cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.reflector.getAllAndOverride<RateLimitConfig>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No rate limit configured, allow request
    if (!config) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const key = this.generateKey(request, config);
    const now = Date.now();

    let entry = this.store.get(key);

    // Reset if window has passed
    if (!entry || now >= entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + config.windowMs,
      };
    }

    entry.count++;
    this.store.set(key, entry);

    // Check if rate limit exceeded
    if (entry.count > config.max) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

      this.logger.warn(
        `Rate limit exceeded: key=${key}, count=${entry.count}, max=${config.max}`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Add rate limit headers to response
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-RateLimit-Limit', config.max);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, config.max - entry.count));
    response.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));

    return true;
  }

  /**
   * Generate a unique key for rate limiting
   * Uses user ID + IP for authenticated requests, just IP for anonymous
   */
  private generateKey(request: Request, config: RateLimitConfig): string {
    const ip = this.getClientIp(request);
    const user = (request as any).user;
    const prefix = config.keyPrefix || request.route?.path || request.path;

    // Use user ID if authenticated and configured to do so
    if (config.useUserId !== false && user?.id) {
      return `${prefix}:user:${user.id}:ip:${ip}`;
    }

    return `${prefix}:ip:${ip}`;
  }

  /**
   * Extract client IP from request, handling proxies
   */
  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = typeof forwarded === 'string' ? forwarded : forwarded[0];
      return ips.split(',')[0].trim();
    }
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  /**
   * Cleanup expired entries to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetTime) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
    }
  }

  /**
   * Clear cleanup interval on module destroy
   */
  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

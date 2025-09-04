import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { GatewayService } from '../gateway.service';
import rateLimit from 'express-rate-limit';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly limiters = new Map<string, any>();

  constructor(private readonly gatewayService: GatewayService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, path } = request;
    const cleanPath = path.replace('/api/gateway', '');

    const route = this.gatewayService.findRoute(method, cleanPath);
    
    if (!route || !route.rateLimit) {
      return true;
    }

    const limiterKey = `${route.target}:${route.rateLimit.windowMs}:${route.rateLimit.max}`;
    
    if (!this.limiters.has(limiterKey)) {
      const limiter = rateLimit({
        windowMs: route.rateLimit.windowMs,
        max: route.rateLimit.max,
        message: {
          error: 'Too many requests',
          message: `Rate limit exceeded for ${route.target}. Try again later.`,
          retryAfter: Math.ceil(route.rateLimit.windowMs / 1000),
          limit: route.rateLimit.max,
          timestamp: new Date().toISOString(),
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
          const forwarded = req.headers['x-forwarded-for'];
          const ip = forwarded ? forwarded.toString().split(',')[0] : req.connection.remoteAddress;
          return `${ip}:${route.target}`;
        },
        handler: (req, res) => {
          this.logger.warn(`Rate limit exceeded for ${req.ip} on ${route.target}`);
          throw new HttpException(
            {
              error: 'Too many requests',
              message: `Rate limit exceeded for ${route.target}. Try again later.`,
              retryAfter: Math.ceil(route.rateLimit.windowMs / 1000),
              limit: route.rateLimit.max,
              timestamp: new Date().toISOString(),
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        },
      });

      this.limiters.set(limiterKey, limiter);
    }

    const limiter = this.limiters.get(limiterKey);
    
    return new Promise((resolve) => {
      limiter(request, context.switchToHttp().getResponse(), (error?: any) => {
        if (error) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }
}
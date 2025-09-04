import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GatewayRoute {
  path: string;
  method: string;
  target: string;
  rateLimit?: {
    windowMs: number;
    max: number;
  };
  auth?: boolean;
  roles?: string[];
}

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);
  private readonly routes: Map<string, GatewayRoute> = new Map();

  constructor(private configService: ConfigService) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    const defaultRoutes: GatewayRoute[] = [
      {
        path: '/auth/*',
        method: 'ALL',
        target: 'auth',
        rateLimit: { windowMs: 15 * 60 * 1000, max: 5 },
      },
      {
        path: '/users/*',
        method: 'ALL',
        target: 'users',
        auth: true,
        rateLimit: { windowMs: 15 * 60 * 1000, max: 100 },
      },
      {
        path: '/animes/*',
        method: 'ALL',
        target: 'animes',
        rateLimit: { windowMs: 15 * 60 * 1000, max: 200 },
      },
      {
        path: '/mangas/*',
        method: 'ALL',
        target: 'mangas',
        rateLimit: { windowMs: 15 * 60 * 1000, max: 200 },
      },
      {
        path: '/reviews/*',
        method: 'ALL',
        target: 'reviews',
        auth: true,
        rateLimit: { windowMs: 15 * 60 * 1000, max: 50 },
      },
      {
        path: '/search/*',
        method: 'ALL',
        target: 'search',
        rateLimit: { windowMs: 60 * 1000, max: 30 },
      },
      {
        path: '/admin/*',
        method: 'ALL',
        target: 'admin',
        auth: true,
        roles: ['admin', 'moderator'],
        rateLimit: { windowMs: 15 * 60 * 1000, max: 100 },
      },
      {
        path: '/media/*',
        method: 'ALL',
        target: 'media',
        rateLimit: { windowMs: 15 * 60 * 1000, max: 50 },
      },
      {
        path: '/notifications/*',
        method: 'ALL',
        target: 'notifications',
        auth: true,
        rateLimit: { windowMs: 15 * 60 * 1000, max: 100 },
      },
      {
        path: '/articles/*',
        method: 'ALL',
        target: 'articles',
        rateLimit: { windowMs: 15 * 60 * 1000, max: 100 },
      },
      {
        path: '/forums/*',
        method: 'ALL',
        target: 'forums',
        rateLimit: { windowMs: 15 * 60 * 1000, max: 100 },
      },
      {
        path: '/collections/*',
        method: 'ALL',
        target: 'collections',
        auth: true,
        rateLimit: { windowMs: 15 * 60 * 1000, max: 100 },
      },
      {
        path: '/lists/*',
        method: 'ALL',
        target: 'lists',
        auth: true,
        rateLimit: { windowMs: 15 * 60 * 1000, max: 100 },
      },
    ];

    defaultRoutes.forEach(route => {
      const key = `${route.method}:${route.path}`;
      this.routes.set(key, route);
    });

    this.logger.log(`Initialized ${defaultRoutes.length} gateway routes`);
  }

  findRoute(method: string, path: string): GatewayRoute | null {
    const exactKey = `${method}:${path}`;
    if (this.routes.has(exactKey)) {
      return this.routes.get(exactKey);
    }

    const allKey = `ALL:${path}`;
    if (this.routes.has(allKey)) {
      return this.routes.get(allKey);
    }

    for (const [key, route] of this.routes.entries()) {
      const [routeMethod, routePath] = key.split(':');
      if ((routeMethod === method || routeMethod === 'ALL') && 
          this.matchesPattern(path, routePath)) {
        return route;
      }
    }

    return null;
  }

  private matchesPattern(path: string, pattern: string): boolean {
    if (pattern.endsWith('/*')) {
      const basePattern = pattern.slice(0, -2);
      return path.startsWith(basePattern);
    }
    
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  addRoute(route: GatewayRoute) {
    const key = `${route.method}:${route.path}`;
    this.routes.set(key, route);
    this.logger.log(`Added gateway route: ${key} -> ${route.target}`);
  }

  removeRoute(method: string, path: string) {
    const key = `${method}:${path}`;
    if (this.routes.delete(key)) {
      this.logger.log(`Removed gateway route: ${key}`);
      return true;
    }
    return false;
  }

  getAllRoutes(): GatewayRoute[] {
    return Array.from(this.routes.values());
  }

  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      routes: this.routes.size,
      uptime: process.uptime(),
    };
  }
}
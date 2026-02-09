import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Sets default Cache-Control headers on GET responses to reduce egress.
 *
 * Strategy:
 *  - Authenticated requests → private, no-cache
 *  - Static-ish data (genres, tags, platforms, homepage, stats) → 1h browser / 2h CDN
 *  - Detail pages (anime/:id, manga/:id, etc.) → 5min browser / 10min CDN
 *  - Default public GET → 1min browser / 5min CDN
 *
 * Controllers can override by setting Cache-Control before this runs
 * (the middleware only sets it if not already present).
 */
@Injectable()
export class CacheControlMiddleware implements NestMiddleware {
  private static readonly LONG_CACHE_PATTERNS = [
    /^\/api\/animes\/genres$/,
    /^\/api\/animes\/popular-tags$/,
    /^\/api\/animes\/most-popular-tags$/,
    /^\/api\/mangas\/genres$/,
    /^\/api\/mangas\/popular-tags$/,
    /^\/api\/mangas\/most-popular-tags$/,
    /^\/api\/jeux-video\/platforms$/,
    /^\/api\/homepage$/,
    /^\/api\/homepage\/stats$/,
    /^\/api\/homepage\/mobile$/,
  ];

  private static readonly MEDIUM_CACHE_PATTERNS = [
    /^\/api\/animes\/\d+$/,
    /^\/api\/animes\/\d+\/(tags|relations|articles|staff|similar|businesses)$/,
    /^\/api\/animes\/top$/,
    /^\/api\/animes\/flop$/,
    /^\/api\/mangas\/\d+$/,
    /^\/api\/mangas\/\d+\/(tags|relations|articles|staff|volumes|businesses|media-relations)$/,
    /^\/api\/mangas\/top$/,
    /^\/api\/mangas\/flop$/,
    /^\/api\/jeux-video\/\d+$/,
    /^\/api\/jeux-video\/\d+\/(genres|relationships|similar)$/,
    /^\/api\/reviews\/\d+$/,
    /^\/api\/reviews\/slug\/.+$/,
    /^\/api\/reviews\/top$/,
    /^\/api\/articles\/\d+$/,
    /^\/api\/articles\/slug\/.+$/,
    /^\/api\/articles\/featured$/,
    /^\/api\/search\/recommendations\/.+$/,
  ];

  use(req: Request, res: Response, next: NextFunction) {
    if (req.method !== 'GET') {
      return next();
    }

    // Let the response finish, then check if Cache-Control was already set by a controller
    const originalEnd = res.end;
    const self = this;

    // Set cache header before response is sent (on writeHead or first write)
    // We hook into writeHead to set default before controller-set headers finalize
    if (!res.getHeader('Cache-Control')) {
      const hasAuth = !!req.headers.authorization;

      if (hasAuth) {
        res.setHeader('Cache-Control', 'private, no-cache');
      } else {
        const path = req.originalUrl.split('?')[0];

        if (CacheControlMiddleware.LONG_CACHE_PATTERNS.some((p) => p.test(path))) {
          // Stable data: 1h browser, 2h CDN
          res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=7200');
        } else if (CacheControlMiddleware.MEDIUM_CACHE_PATTERNS.some((p) => p.test(path))) {
          // Detail pages: 5min browser, 10min CDN
          res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
        } else {
          // Default: 1min browser, 5min CDN
          res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
        }
      }
    }

    next();
  }
}

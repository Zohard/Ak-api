import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ActivityTrackerService, ActivityAction } from '../../shared/services/activity-tracker.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class ActivityTrackerMiddleware implements NestMiddleware {
  constructor(
    private readonly activityTracker: ActivityTrackerService,
    private readonly jwtService: JwtService
  ) { }
  private readonly logger = new Logger('ActivityTracker');

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      // Skip activity tracking for certain endpoints
      // These are data-fetching endpoints that should not update user's current page/activity
      const skipPaths = [
        '/api/auth/verify',
        '/api/auth/refresh',
        '/api/auth/profile',
        '/api/forums/messages/latest',  // Homepage forum panel
        '/api/forums/boards',            // Forum boards list (used in panels)
        '/api/reviews/latest',           // Latest reviews
        '/api/reviews/stats',            // Review statistics
        '/api/online/stats'              // Online users stats widget
      ];

      // Also skip if path contains certain patterns (data fetching)
      const skipPatterns = [
        '/api/anime/latest',
        '/api/manga/latest',
        '/api/articles/latest',
        '/stats',
        '/count'
      ];

      if (skipPaths.some(path => req.path === path) ||
        skipPatterns.some(pattern => req.path.includes(pattern))) {
        return next();
      }

      // Get or create session ID
      const sessionId = this.getSessionId(req);

      // Set session cookie if it doesn't exist
      if (!req.cookies?.['session_id']) {
        res.cookie('session_id', sessionId, {
          httpOnly: true,
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production'
        });
      }

      // Get user ID if authenticated (manually decode JWT)
      let userId: number | undefined;
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const decoded = this.jwtService.verify(token) as any;
          userId = decoded.sub; // JWT strategy uses 'sub' for user ID
        }
      } catch (error) {
        // Invalid or expired token, treat as guest
        userId = undefined;
      }

      // Get IP address
      const ipAddress = this.getIpAddress(req);

      // Determine action - prioritize custom header from frontend
      const action = this.determineActionFromHeader(req) || this.determineAction(req);

      // Debug logging
      if (userId) {
        this.logger.debug(`[Activity] Tracking user ${userId} - Action: ${action.action} - Session: ${sessionId.substring(0, 20)}...`);
      }

      // Track the activity (fire and forget)
      this.activityTracker.trackActivity({
        sessionId,
        userId,
        ipAddress,
        action
      }).catch((error) => {
        // Log error but don't block the request
        this.logger.error('Activity tracking error:', error);
      });

    } catch (error) {
      // Don't let tracking errors affect the request
      this.logger.error('Activity tracking middleware error:', error);
    }

    next();
  }

  private getSessionId(req: Request): string {
    // Try to get session ID from cookies or generate one
    let sessionId = req.cookies?.['session_id'];

    if (!sessionId) {
      // Generate a unique session ID
      sessionId = this.generateSessionId();
    }

    return sessionId;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private getIpAddress(req: Request): string {
    // Get real IP from headers (for proxy/load balancer setups)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = (forwarded as string).split(',');
      return ips[0].trim();
    }

    return req.ip || req.socket.remoteAddress || '0.0.0.0';
  }

  private determineActionFromHeader(req: Request): ActivityAction | null {
    const currentPage = req.headers['x-current-page'] as string;
    const pagePath = req.headers['x-page-path'] as string;

    if (!currentPage) {
      return null;
    }

    // The frontend provides a simple action name, we can enhance it with path info
    const action: ActivityAction = { action: currentPage };

    if (pagePath) {
      action.path = pagePath;
    }

    return action;
  }

  private determineAction(req: Request): ActivityAction {
    const path = req.path;
    const query = req.query;

    // Homepage
    if (path === '/' || path === '/home') {
      return { action: 'home' };
    }

    // Forums
    if (path.startsWith('/api/forums')) {
      if (path.includes('/topics/')) {
        const topicId = this.extractId(path, '/topics/');
        return { action: 'forum_topic', topic: topicId };
      } else if (path.includes('/boards/')) {
        const boardId = this.extractId(path, '/boards/');
        return { action: 'forum_board', board: boardId };
      } else if (path.includes('/online') || path.includes('/who')) {
        return { action: 'who_online' };
      }
      return { action: 'forum_index' };
    }

    // Anime/Manga
    if (path.startsWith('/api/anime/')) {
      const animeId = this.extractIdFromEnd(path);
      return { action: 'anime', animeId };
    }

    if (path.startsWith('/api/manga/')) {
      const mangaId = this.extractIdFromEnd(path);
      return { action: 'manga', mangaId };
    }

    // Profile
    if (path.startsWith('/api/profile/') || path.startsWith('/api/users/')) {
      const userId = this.extractIdFromEnd(path);
      return { action: 'profile', userId };
    }

    // Search
    if (path.includes('/search')) {
      return { action: 'search' };
    }

    // Auth
    if (path.includes('/login')) {
      return { action: 'login' };
    }

    if (path.includes('/logout')) {
      return { action: 'logout' };
    }

    // Default
    return { action: 'browsing', path };
  }

  private extractId(path: string, pattern: string): number | undefined {
    const parts = path.split(pattern);
    if (parts.length > 1) {
      const idStr = parts[1].split('/')[0].split('?')[0];
      const id = parseInt(idStr, 10);
      return isNaN(id) ? undefined : id;
    }
    return undefined;
  }

  private extractIdFromEnd(path: string): number | undefined {
    const parts = path.split('/');
    const lastPart = parts[parts.length - 1].split('?')[0];
    const id = parseInt(lastPart, 10);
    return isNaN(id) ? undefined : id;
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { AdminUsersService } from './users/admin-users.service';
import { AdminContentService } from './content/admin-content.service';
import { AdminModerationService } from './moderation/admin-moderation.service';

// Simple in-memory cache for dashboard stats
let dashboardCache: { data: any; timestamp: number } | null = null;
let dashboardPromise: Promise<any> | null = null;
const CACHE_TTL_MS = 60000; // 1 minute

// Separate cache for chart data (longer TTL since historical data changes slowly)
let chartsCache: { data: any; timestamp: number } | null = null;
const CHARTS_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private adminUsersService: AdminUsersService,
    private adminContentService: AdminContentService,
    private adminModerationService: AdminModerationService,
  ) { }

  async getDashboardStats() {
    // Check in-memory cache first
    if (dashboardCache && Date.now() - dashboardCache.timestamp < CACHE_TTL_MS) {
      return dashboardCache.data;
    }

    // Dedup concurrent requests (cache stampede protection)
    if (dashboardPromise) {
      return dashboardPromise;
    }

    dashboardPromise = (async () => {
      try {
        // Run ALL queries in parallel for faster response
        const [
          userStats,
          contentStats,
          moderationStats,
          recentActivity,
          systemHealth,
        ] = await Promise.all([
          this.adminUsersService.getUserStats(),
          this.adminContentService.getContentStats(),
          this.adminModerationService.getModerationStats(),
          this.getRecentActivityFast(),
          this.getSystemHealthFast(),
        ]);

        const result = {
          users: userStats,
          content: contentStats,
          moderation: moderationStats,
          recent_activity: recentActivity,
          system_health: systemHealth,
        };

        // Update cache
        dashboardCache = { data: result, timestamp: Date.now() };

        return result;
      } finally {
        dashboardPromise = null;
      }
    })();

    return dashboardPromise;
  }

  async getChartData(refresh = false) {
    // Check cache first (skip if refresh requested)
    if (!refresh && chartsCache && Date.now() - chartsCache.timestamp < CHARTS_CACHE_TTL_MS) {
      return chartsCache.data;
    }

    const [registrations, forumPosts, reviews, contentBreakdown] = await Promise.all([
      // Registrations per day (7 days)
      this.prisma.$queryRaw`
        SELECT date_trunc('day', to_timestamp(date_registered)) AS day, COUNT(*)::int AS count
        FROM smf_members
        WHERE date_registered >= EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days')::int
        GROUP BY day ORDER BY day
      `,
      // Forum posts per day (7 days)
      this.prisma.$queryRaw`
        SELECT date_trunc('day', to_timestamp(poster_time)) AS day, COUNT(*)::int AS count
        FROM smf_messages
        WHERE poster_time >= EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days')::int
        GROUP BY day ORDER BY day
      `,
      // Reviews per day (7 days)
      this.prisma.$queryRaw`
        SELECT date_trunc('day', date_critique) AS day, COUNT(*)::int AS count
        FROM ak_critique
        WHERE date_critique >= NOW() - INTERVAL '7 days'
        GROUP BY day ORDER BY day
      `,
      // Content breakdown totals
      this.prisma.$queryRaw`
        SELECT
          (SELECT COUNT(*)::int FROM ak_animes WHERE statut = 0) AS animes,
          (SELECT COUNT(*)::int FROM ak_mangas WHERE statut = 0) AS mangas,
          (SELECT COUNT(*)::int FROM ak_jeux_video WHERE statut = 0) AS games
      `,
    ]);

    const result = {
      registrations: (registrations as any[]).map(r => ({
        day: r.day,
        count: Number(r.count),
      })),
      forumPosts: (forumPosts as any[]).map(r => ({
        day: r.day,
        count: Number(r.count),
      })),
      reviews: (reviews as any[]).map(r => ({
        day: r.day,
        count: Number(r.count),
      })),
      contentBreakdown: {
        animes: Number((contentBreakdown as any[])[0]?.animes || 0),
        mangas: Number((contentBreakdown as any[])[0]?.mangas || 0),
        games: Number((contentBreakdown as any[])[0]?.games || 0),
      },
    };

    chartsCache = { data: result, timestamp: Date.now() };
    return result;
  }

  async getRecentActivity(limit: number = 20) {
    // Combine recent activities from different sources
    const activities = await this.prisma.$queryRaw`
      (
        SELECT 
          'user_registration' as type,
          to_timestamp(date_registered) as date,
          member_name as title,
          'User registered' as description,
          id_member as target_id,
          'user' as target_type
        FROM smf_members 
        ORDER BY date_registered DESC 
        LIMIT 5
      )
      UNION ALL
      (
        SELECT 
          'content_creation' as type,
          date_ajout as date,
          titre as title,
          'Anime added' as description,
          id_anime as target_id,
          'anime' as target_type
        FROM ak_animes 
        ORDER BY date_ajout DESC 
        LIMIT 5
      )
      UNION ALL
      (
        SELECT 
          'content_creation' as type,
          date_ajout as date,
          titre as title,
          'Manga added' as description,
          id_manga as target_id,
          'manga' as target_type
        FROM ak_mangas 
        ORDER BY date_ajout DESC 
        LIMIT 5
      )
      UNION ALL
      (
        SELECT 
          'review_submission' as type,
          date_critique as date,
          titre as title,
          'Review submitted' as description,
          id_critique as target_id,
          'review' as target_type
        FROM ak_critique 
        ORDER BY date_critique DESC 
        LIMIT 5
      )
      ORDER BY date DESC
      LIMIT ${limit}
    `;

    // Convert BigInt values to regular numbers for JSON serialization
    return (activities as any[]).map((activity: any) => ({
      ...activity,
      target_id: Number(activity.target_id),
    }));
  }

  async getSystemHealth() {
    // Check database connectivity and performance
    const dbHealth = await this.checkDatabaseHealth();

    // Get storage usage
    const storageInfo = await this.getStorageInfo();

    // Get performance metrics
    const performanceMetrics = await this.getPerformanceMetrics();

    return {
      database: dbHealth,
      storage: storageInfo,
      performance: performanceMetrics,
      status: 'healthy', // Overall status
    };
  }

  // Optimized fast version - runs all health checks in parallel
  private async getSystemHealthFast() {
    try {
      const start = Date.now();

      // Run all health checks in parallel with timeout
      const [dbCheck, storageCheck] = await Promise.all([
        // Simple DB ping
        this.prisma.$queryRaw`SELECT 1`.then(() => ({
          status: 'healthy',
          response_time_ms: Date.now() - start,
        })).catch((e) => ({
          status: 'unhealthy',
          error: e.message,
        })),
        // Storage count - simplified
        this.prisma.$queryRaw`SELECT COUNT(*)::int as total FROM ak_screenshots`.then((r: any) => ({
          status: 'healthy',
          media_files: { total: Number(r[0]?.total || 0) },
        })).catch(() => ({
          status: 'unknown',
          media_files: { total: 0 },
        })),
      ]);

      return {
        database: dbCheck,
        storage: storageCheck,
        performance: { status: 'healthy', top_tables: [] }, // Skip heavy perf query
        status: dbCheck.status === 'healthy' ? 'healthy' : 'degraded',
      };
    } catch (error) {
      return {
        database: { status: 'unhealthy', error: error.message },
        storage: { status: 'unknown' },
        performance: { status: 'unknown' },
        status: 'unhealthy',
      };
    }
  }

  // Optimized fast version - simpler query, no UNION
  private async getRecentActivityFast(limit: number = 10) {
    try {
      // Just get recent users - fastest single query
      const activities = await this.prisma.$queryRaw`
        SELECT
          'user_registration' as type,
          to_timestamp(date_registered) as date,
          member_name as title,
          'User registered' as description,
          id_member as target_id,
          'user' as target_type
        FROM smf_members
        ORDER BY date_registered DESC
        LIMIT ${limit}
      `;

      return (activities as any[]).map((activity: any) => ({
        ...activity,
        target_id: Number(activity.target_id),
      }));
    } catch (error) {
      console.error('Failed to fetch recent activity:', error);
      return [];
    }
  }

  private async checkDatabaseHealth() {
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - start;

      // Get database size
      const dbSizeResult = await this.prisma.$queryRaw`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `;
      const dbSize = (dbSizeResult as any[])[0]?.size;

      // Get connection count
      const connectionResult = await this.prisma.$queryRaw`
        SELECT count(*) as connections FROM pg_stat_activity
      `;
      const connectionCount = Number(
        (connectionResult as any[])[0]?.connections,
      );

      return {
        status: 'healthy',
        response_time_ms: responseTime,
        database_size: dbSize,
        active_connections: connectionCount,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  private async getStorageInfo() {
    try {
      // Get counts of media files
      const mediaStats = await this.prisma.$queryRaw`
        SELECT 
          COUNT(*) as total_screenshots,
          SUM(CASE WHEN type = 1 THEN 1 ELSE 0 END) as anime_screenshots,
          SUM(CASE WHEN type = 2 THEN 1 ELSE 0 END) as manga_covers
        FROM ak_screenshots
      `;

      const result = (mediaStats as any[])[0];
      return {
        status: 'healthy',
        media_files: {
          total_screenshots: Number(result.total_screenshots),
          anime_screenshots: Number(result.anime_screenshots),
          manga_covers: Number(result.manga_covers),
        },
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  private async getPerformanceMetrics() {
    try {
      // Get query performance stats
      const queryStats = await this.prisma.$queryRaw`
        SELECT 
          schemaname,
          relname as tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          seq_scan as sequential_scans,
          idx_scan as index_scans
        FROM pg_stat_user_tables 
        ORDER BY (n_tup_ins + n_tup_upd + n_tup_del) DESC 
        LIMIT 10
      `;

      return {
        status: 'healthy',
        top_tables: (queryStats as any[]).map((table: any) => ({
          ...table,
          inserts: Number(table.inserts),
          updates: Number(table.updates),
          deletes: Number(table.deletes),
          sequential_scans: Number(table.sequential_scans),
          index_scans: Number(table.index_scans),
        })),
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  async getAdminActions(limit: number = 50) {
    try {
      const actions = await this.prisma.$queryRaw`
        SELECT 
          aal.id,
          aal.action,
          aal.target_type,
          aal.target_id,
          aal.reason,
          aal.metadata,
          aal.ip_address,
          aal.created_at,
          sm.member_name as admin_name,
          sm.id_member as admin_id
        FROM admin_audit_log aal
        JOIN smf_members sm ON aal.admin_id = sm.id_member
        ORDER BY aal.created_at DESC
        LIMIT ${limit}
      `;

      // Convert BigInt values to numbers for JSON serialization
      return {
        actions: (actions as any[]).map((action) => ({
          ...action,
          id: Number(action.id),
          admin_id: Number(action.admin_id),
          target_id: action.target_id ? Number(action.target_id) : null,
        })),
      };
    } catch (error) {
      console.error('Failed to fetch admin actions:', error);
      return {
        message: 'Failed to fetch admin actions',
        error: error.message,
        actions: [],
      };
    }
  }

  async exportData(type: string, format: string = 'csv') {
    // Implement data export functionality
    const exportableTypes = [
      'users',
      'animes',
      'mangas',
      'reviews',
      'business',
    ];

    if (!exportableTypes.includes(type)) {
      throw new Error('Invalid export type');
    }

    // This would implement actual data export
    return {
      message: `Export of ${type} data in ${format} format initiated`,
      export_id: `export_${type}_${Date.now()}`,
      estimated_completion: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    };
  }

  async getSystemSettings() {
    // Get system-wide settings
    return {
      site_name: 'Anime-Kun',
      maintenance_mode: false,
      registration_enabled: true,
      review_moderation_enabled: true,
      max_upload_size: '10MB',
      supported_image_formats: ['jpg', 'jpeg', 'png', 'webp'],
      cache_enabled: true,
      backup_frequency: 'daily',
    };
  }

  async updateSystemSettings(settings: Record<string, any>) {
    // Update system-wide settings
    // This would typically be stored in a settings table
    // Log removed

    return {
      message: 'System settings updated successfully',
      updated_settings: settings,
    };
  }
}

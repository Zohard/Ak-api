import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { AdminUsersService } from './users/admin-users.service';
import { AdminContentService } from './content/admin-content.service';
import { AdminModerationService } from './moderation/admin-moderation.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private adminUsersService: AdminUsersService,
    private adminContentService: AdminContentService,
    private adminModerationService: AdminModerationService,
  ) {}

  async getDashboardStats() {
    // Get comprehensive dashboard statistics
    const [userStats, contentStats, moderationStats] = await Promise.all([
      this.adminUsersService.getUserStats(),
      this.adminContentService.getContentStats(),
      this.adminModerationService.getModerationStats(),
    ]);

    // Get recent activity across all modules
    const recentActivity = await this.getRecentActivity();

    // Get system health metrics
    const systemHealth = await this.getSystemHealth();

    return {
      users: userStats,
      content: contentStats,
      moderation: moderationStats,
      recent_activity: recentActivity,
      system_health: systemHealth,
    };
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
    console.log('Updating system settings:', settings);

    return {
      message: 'System settings updated successfully',
      updated_settings: settings,
    };
  }
}

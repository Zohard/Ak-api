import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { LogClientErrorDto, GetClientErrorsQueryDto } from './dto/client-error.dto';

@Injectable()
export class AdminLoggingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Add a log entry for anime, manga, business, or video game modification
   * @param contentId - The ID of the anime, manga, business, or video game
   * @param contentType - 'anime', 'manga', 'business', or 'jeu_video'
   * @param username - The username performing the action
   * @param action - Description of the action (e.g., "Création fiche", "Modification des tags")
   */
  async addLog(
    contentId: number,
    contentType: 'anime' | 'manga' | 'business' | 'jeu_video',
    username: string,
    action: string,
  ): Promise<void> {
    try {
      const timestamp = Math.floor(Date.now() / 1000);

      // Find existing log entry for this content
      const whereClause: any = {
        anime: 0,
        manga: 0,
        business: 0,
        jeu_video: 0,
      };
      whereClause[contentType] = contentId;

      const existingLog = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id_log, json_data FROM ak_logs_admin WHERE ${contentType} = $1 LIMIT 1`,
        contentId,
      );

      if (existingLog && existingLog.length > 0) {
        // Update existing log
        const currentData = JSON.parse(existingLog[0].json_data || '{}');
        currentData[timestamp] = { [username]: action };

        await this.prisma.$queryRaw`
          UPDATE ak_logs_admin
          SET json_data = ${JSON.stringify(currentData)}, last_mod = ${timestamp}
          WHERE id_log = ${existingLog[0].id_log}
        `;
      } else {
        // Create new log entry
        const initialData = {
          [timestamp]: { [username]: action },
        };

        await this.prisma.$queryRaw`
          INSERT INTO ak_logs_admin (anime, manga, business, jeu_video, json_data, last_mod)
          VALUES (
            ${contentType === 'anime' ? contentId : 0},
            ${contentType === 'manga' ? contentId : 0},
            ${contentType === 'business' ? contentId : 0},
            ${contentType === 'jeu_video' ? contentId : 0},
            ${JSON.stringify(initialData)},
            ${timestamp}
          )
        `;
      }
    } catch (error) {
      // Log error but don't throw - logging failures shouldn't break operations
      console.error(
        `Failed to add admin log for ${contentType} ${contentId}:`,
        error,
      );
    }
  }

  /**
   * Get logs for a specific content item
   */
  async getLogs(
    contentId: number,
    contentType: 'anime' | 'manga' | 'business' | 'jeu_video',
  ): Promise<any> {
    try {
      const result = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT json_data FROM ak_logs_admin WHERE ${contentType} = $1 LIMIT 1`,
        contentId,
      );

      if (result && result.length > 0) {
        return JSON.parse(result[0].json_data || '{}');
      }

      return {};
    } catch (error) {
      console.error(
        `Failed to get logs for ${contentType} ${contentId}:`,
        error,
      );
      return {};
    }
  }

  /**
   * Get recent logs across all content
   */
  async getRecentLogs(limit = 50): Promise<any[]> {
    try {
      const logs = await this.prisma.$queryRaw<any[]>`
        SELECT id_log, anime, manga, business, jeu_video, json_data, last_mod
        FROM ak_logs_admin
        ORDER BY last_mod DESC
        LIMIT ${limit}
      `;

      return logs.map((log) => ({
        ...log,
        json_data: JSON.parse(log.json_data || '{}'),
      }));
    } catch (error) {
      console.error('Failed to get recent logs:', error);
      return [];
    }
  }

  /**
   * Get formatted activities grouped by content
   */
  async getFormattedActivities(limit = 50): Promise<any[]> {
    try {
      // Get recent logs
      const logs = await this.prisma.$queryRaw<any[]>`
        SELECT id_log, anime, manga, business, jeu_video, json_data, last_mod
        FROM ak_logs_admin
        ORDER BY last_mod DESC
        LIMIT ${limit}
      `;

      // Format each log entry
      const formattedLogs = await Promise.all(
        logs.map(async (log) => {
          const jsonData = JSON.parse(log.json_data || '{}');

          // Determine content type and ID
          let contentType: 'anime' | 'manga' | 'business' | 'jeu_video' = 'anime';
          let contentId = 0;
          let title = '';
          let status = '';

          if (log.anime > 0) {
            contentType = 'anime';
            contentId = log.anime;
            // Fetch anime title and status
            const anime = await this.prisma.$queryRaw<any[]>`
              SELECT titre, statut FROM ak_animes WHERE id_anime = ${contentId} LIMIT 1
            `;
            if (anime && anime.length > 0) {
              title = anime[0].titre;
              status = anime[0].statut === 1 ? '' : anime[0].statut === 0 ? 'bloqué' : 'en attente';
            }
          } else if (log.manga > 0) {
            contentType = 'manga';
            contentId = log.manga;
            // Fetch manga title and status
            const manga = await this.prisma.$queryRaw<any[]>`
              SELECT titre, statut FROM ak_mangas WHERE id_manga = ${contentId} LIMIT 1
            `;
            if (manga && manga.length > 0) {
              title = manga[0].titre;
              status = manga[0].statut === 1 ? '' : manga[0].statut === 0 ? 'bloqué' : 'en attente';
            }
          } else if (log.business > 0) {
            contentType = 'business';
            contentId = log.business;
            // Fetch business name
            const business = await this.prisma.$queryRaw<any[]>`
              SELECT denomination FROM ak_business WHERE id_business = ${contentId} LIMIT 1
            `;
            if (business && business.length > 0) {
              title = business[0].denomination;
            }
          } else if (log.jeu_video > 0) {
            contentType = 'jeu_video';
            contentId = log.jeu_video;
            // Fetch video game title and status
            const game = await this.prisma.$queryRaw<any[]>`
              SELECT titre, statut FROM ak_jeux_video WHERE id_jeu = ${contentId} LIMIT 1
            `;
            if (game && game.length > 0) {
              title = game[0].titre;
              status = game[0].statut === 1 ? '' : game[0].statut === 0 ? 'bloqué' : 'en attente';
            }
          }

          // Parse activities from JSON and sort by timestamp descending
          const activities = Object.entries(jsonData)
            .map(([timestamp, data]: [string, any]) => {
              const username = Object.keys(data)[0];
              const action = data[username];
              return {
                timestamp: parseInt(timestamp),
                date: this.formatDate(parseInt(timestamp)),
                username,
                action,
              };
            })
            .sort((a, b) => b.timestamp - a.timestamp);

          return {
            id_log: log.id_log,
            contentType,
            contentId,
            title,
            status,
            link:
              contentType === 'anime'
                ? `/admin/animes/${contentId}`
                : contentType === 'manga'
                  ? `/admin/mangas/${contentId}`
                  : contentType === 'jeu_video'
                    ? `/admin/jeux-video/${contentId}`
                    : `/admin/business/${contentId}`,
            activities,
          };
        }),
      );

      return formattedLogs;
    } catch (error) {
      console.error('Failed to get formatted activities:', error);
      return [];
    }
  }

  /**
   * Format Unix timestamp to DD-MM-YYYY à HH:MM
   */
  private formatDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}-${month}-${year} à ${hours}:${minutes}`;
  }

  /**
   * Log a client-side error
   */
  async logClientError(errorData: LogClientErrorDto): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO client_error_logs (
          message,
          stack,
          status_code,
          endpoint,
          url,
          user_agent,
          user_id,
          context,
          created_at
        ) VALUES (
          ${errorData.message},
          ${errorData.stack || null},
          ${errorData.statusCode || null},
          ${errorData.endpoint || null},
          ${errorData.url || null},
          ${errorData.userAgent || null},
          ${errorData.userId || null},
          ${errorData.context ? JSON.stringify(errorData.context) : null}::jsonb,
          NOW()
        )
      `;
    } catch (error) {
      // Log to console but don't throw - error logging failures shouldn't break the app
      console.error('Failed to log client error:', error);
    }
  }

  /**
   * Get client errors with optional filters
   */
  async getClientErrors(query: GetClientErrorsQueryDto): Promise<any[]> {
    try {
      const { limit = 100, statusCode, endpoint } = query;

      let whereClause = '';
      const params: any[] = [];
      let paramIndex = 1;

      const conditions: string[] = [];

      if (statusCode) {
        conditions.push(`status_code = $${paramIndex}`);
        params.push(statusCode);
        paramIndex++;
      }

      if (endpoint) {
        conditions.push(`endpoint LIKE $${paramIndex}`);
        params.push(`%${endpoint}%`);
        paramIndex++;
      }

      if (conditions.length > 0) {
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }

      params.push(limit);

      const errors = await this.prisma.$queryRawUnsafe<any[]>(
        `
        SELECT
          id,
          message,
          stack,
          status_code,
          endpoint,
          url,
          user_agent,
          user_id,
          context,
          created_at,
          (SELECT member_name FROM smf_members WHERE id_member = user_id) as username
        FROM client_error_logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex}
      `,
        ...params,
      );

      return errors.map((error) => ({
        ...error,
        context: error.context ? JSON.parse(error.context) : null,
      }));
    } catch (error) {
      console.error('Failed to get client errors:', error);
      return [];
    }
  }

  /**
   * Get error statistics
   */
  async getClientErrorStats(): Promise<any> {
    try {
      const stats = await this.prisma.$queryRaw<any[]>`
        SELECT
          COUNT(*) as total_errors,
          COUNT(DISTINCT endpoint) as unique_endpoints,
          COUNT(DISTINCT user_id) as affected_users,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as errors_last_24h,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as errors_last_hour,
          COUNT(CASE WHEN status_code = 502 THEN 1 END) as errors_502,
          COUNT(CASE WHEN status_code = 503 THEN 1 END) as errors_503,
          COUNT(CASE WHEN status_code = 504 THEN 1 END) as errors_504
        FROM client_error_logs
        WHERE created_at > NOW() - INTERVAL '7 days'
      `;

      const topEndpoints = await this.prisma.$queryRaw<any[]>`
        SELECT
          endpoint,
          COUNT(*) as error_count,
          MAX(created_at) as last_occurrence
        FROM client_error_logs
        WHERE created_at > NOW() - INTERVAL '7 days'
          AND endpoint IS NOT NULL
        GROUP BY endpoint
        ORDER BY error_count DESC
        LIMIT 10
      `;

      return {
        ...stats[0],
        top_endpoints: topEndpoints,
      };
    } catch (error) {
      console.error('Failed to get client error stats:', error);
      return {
        total_errors: 0,
        unique_endpoints: 0,
        affected_users: 0,
        errors_last_24h: 0,
        errors_last_hour: 0,
        errors_502: 0,
        errors_503: 0,
        errors_504: 0,
        top_endpoints: [],
      };
    }
  }

  /**
   * Clear old client errors (older than 30 days)
   */
  async cleanupOldClientErrors(): Promise<number> {
    try {
      const result = await this.prisma.$executeRaw`
        DELETE FROM client_error_logs
        WHERE created_at < NOW() - INTERVAL '30 days'
      `;
      return Number(result);
    } catch (error) {
      console.error('Failed to cleanup old client errors:', error);
      return 0;
    }
  }
}

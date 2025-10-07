import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';

@Injectable()
export class AdminLoggingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Add a log entry for anime, manga, or business modification
   * @param contentId - The ID of the anime, manga, or business
   * @param contentType - 'anime', 'manga', or 'business'
   * @param username - The username performing the action
   * @param action - Description of the action (e.g., "Création fiche", "Modification des tags")
   */
  async addLog(
    contentId: number,
    contentType: 'anime' | 'manga' | 'business',
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
          INSERT INTO ak_logs_admin (anime, manga, business, json_data, last_mod)
          VALUES (
            ${contentType === 'anime' ? contentId : 0},
            ${contentType === 'manga' ? contentId : 0},
            ${contentType === 'business' ? contentId : 0},
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
    contentType: 'anime' | 'manga' | 'business',
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
        SELECT id_log, anime, manga, business, json_data, last_mod
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
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';

export interface AuditLogEntry {
  admin_id: number;
  action: string;
  target_type?: string;
  target_id?: number;
  reason?: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}

export interface SimpleAuditLogEntry {
  admin_id: number;
  action: string;
  target_type?: string;
  target_id?: number;
  reason?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async logAction(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.$queryRaw`
        INSERT INTO admin_audit_log (
          admin_id,
          action,
          target_type,
          target_id,
          reason,
          metadata,
          ip_address,
          user_agent,
          created_at
        ) VALUES (
          ${entry.admin_id},
          ${entry.action},
          ${entry.target_type || null},
          ${entry.target_id || null},
          ${entry.reason || null},
          ${entry.metadata ? JSON.stringify(entry.metadata) : null},
          ${entry.ip_address || null},
          ${entry.user_agent || null},
          NOW()
        )
      `;
    } catch (error) {
      // Log error but don't fail the main operation
      console.error('Failed to write audit log:', error);
    }
  }

  async logSimpleAction(entry: SimpleAuditLogEntry): Promise<void> {
    try {
      await this.prisma.$queryRaw`
        INSERT INTO admin_audit_log (
          admin_id,
          action,
          target_type,
          target_id,
          reason,
          metadata,
          created_at
        ) VALUES (
          ${entry.admin_id},
          ${entry.action},
          ${entry.target_type || null},
          ${entry.target_id || null},
          ${entry.reason || null},
          ${entry.metadata ? JSON.stringify(entry.metadata) : null},
          NOW()
        )
      `;
    } catch (error) {
      // Log error but don't fail the main operation
      console.error('Failed to write audit log:', error);
    }
  }

  async getAuditLogs(params: {
    page?: number;
    limit?: number;
    admin_id?: number;
    action?: string;
    target_type?: string;
    date_from?: Date;
    date_to?: Date;
  }) {
    const {
      page = 1,
      limit = 50,
      admin_id,
      action,
      target_type,
      date_from,
      date_to,
    } = params;

    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const whereConditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (admin_id) {
      whereConditions.push(`al.admin_id = $${paramIndex}`);
      queryParams.push(admin_id);
      paramIndex++;
    }

    if (action) {
      whereConditions.push(`al.action ILIKE $${paramIndex}`);
      queryParams.push(`%${action}%`);
      paramIndex++;
    }

    if (target_type) {
      whereConditions.push(`al.target_type = $${paramIndex}`);
      queryParams.push(target_type);
      paramIndex++;
    }

    if (date_from) {
      whereConditions.push(`al.created_at >= $${paramIndex}`);
      queryParams.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      whereConditions.push(`al.created_at <= $${paramIndex}`);
      queryParams.push(date_to);
      paramIndex++;
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

    // Get audit logs with admin details
    const logsQuery = `
      SELECT 
        al.*,
        u.member_name as admin_name,
        u.real_name as admin_display_name
      FROM admin_audit_log al
      LEFT JOIN smf_members u ON al.admin_id = u.id_member
      ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limit, offset);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM admin_audit_log al
      ${whereClause}
    `;

    const [logs, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe(logsQuery, ...queryParams),
      this.prisma.$queryRawUnsafe(countQuery, ...queryParams.slice(0, -2)),
    ]);

    const total = Number((countResult as any)[0]?.total || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      logs: logs as any[],
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async getActionStats(days: number = 30) {
    const stats = await this.prisma.$queryRaw`
      SELECT 
        action,
        COUNT(*) as count,
        DATE(created_at) as date
      FROM admin_audit_log
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY action, DATE(created_at)
      ORDER BY date DESC, count DESC
    `;

    return stats;
  }

  async getTopAdmins(days: number = 30, limit: number = 10) {
    const topAdmins = await this.prisma.$queryRaw`
      SELECT 
        al.admin_id,
        u.member_name as admin_name,
        u.real_name as admin_display_name,
        COUNT(*) as action_count,
        COUNT(DISTINCT action) as unique_actions
      FROM admin_audit_log al
      LEFT JOIN smf_members u ON al.admin_id = u.id_member
      WHERE al.created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY al.admin_id, u.member_name, u.real_name
      ORDER BY action_count DESC
      LIMIT ${limit}
    `;

    return topAdmins;
  }

  async exportAuditLogs(params: {
    admin_id?: number;
    action?: string;
    target_type?: string;
    date_from?: Date;
    date_to?: Date;
    format?: 'json' | 'csv';
  }) {
    const { format = 'json', ...filterParams } = params;

    // Get all matching logs (without pagination)
    const result = await this.getAuditLogs({
      ...filterParams,
      limit: 10000, // Large limit for export
    });

    if (format === 'csv') {
      return this.convertToCSV(result.logs);
    }

    return {
      format: 'json',
      data: result.logs,
      total_records: result.pagination.totalItems,
      exported_at: new Date().toISOString(),
    };
  }

  private convertToCSV(logs: any[]): string {
    if (logs.length === 0) {
      return 'No data to export';
    }

    const headers = [
      'ID',
      'Admin ID',
      'Admin Name',
      'Action',
      'Target Type',
      'Target ID',
      'Reason',
      'IP Address',
      'Created At',
    ];

    const csvRows = [
      headers.join(','),
      ...logs.map((log) =>
        [
          log.id,
          log.admin_id,
          log.admin_name || '',
          log.action,
          log.target_type || '',
          log.target_id || '',
          (log.reason || '').replace(/,/g, ';'), // Replace commas to avoid CSV issues
          log.ip_address || '',
          log.created_at,
        ].join(','),
      ),
    ];

    return csvRows.join('\n');
  }

  // Helper method to create audit log decorator
  static createLogDecorator(action: string, target_type?: string) {
    return function (
      target: any,
      propertyName: string,
      descriptor: PropertyDescriptor,
    ) {
      const method = descriptor.value;

      descriptor.value = async function (...args: any[]) {
        const request = args.find((arg) => arg && arg.user);
        const result = await method.apply(this, args);

        if (request && request.user) {
          const auditService =
            this.auditLogService ||
            (this.moduleRef &&
              this.moduleRef.get(AuditLogService, { strict: false }));

          if (auditService) {
            await auditService.logAction({
              admin_id: request.user.id,
              action,
              target_type,
              target_id: args.find((arg) => typeof arg === 'number'),
              ip_address: request.ip,
              user_agent: request.get('User-Agent'),
              metadata: {
                method: propertyName,
                arguments: args.filter((arg) => arg !== request),
              },
            });
          }
        }

        return result;
      };
    };
  }
}

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { UserAdminQueryDto } from './dto/user-admin-query.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import { UserActionLogDto } from './dto/user-action-log.dto';

@Injectable()
export class AdminUsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: UserAdminQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      group,
      sort = 'date_registered',
      order = 'DESC',
    } = query;
    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(
        `(u.member_name ILIKE $${paramIndex} OR u.real_name ILIKE $${paramIndex} OR u.email_address ILIKE $${paramIndex})`,
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (group) {
      switch (group) {
        case 'administrator':
          whereConditions.push(`u.id_group = 1`);
          break;
        case 'moderator':
          whereConditions.push(`u.id_group = 2`);
          break;
        case 'banned':
          whereConditions.push(`u.is_activated = 0`);
          break;
        case 'premium':
          whereConditions.push(`u.id_group = 4`);
          break;
        case 'regular':
          whereConditions.push(`u.id_group = 0`);
          break;
      }
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

    // Validate sort fields
    const validSortFields = [
      'id_member',
      'member_name',
      'email_address',
      'date_registered',
      'last_login',
      'posts',
    ];
    const sortField = validSortFields.includes(sort) ? sort : 'date_registered';
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

    // Get users with pagination
    const usersQuery = `
      SELECT 
        u.id_member,
        u.member_name,
        u.real_name,
        u.email_address,
        u.date_registered,
        u.last_login,
        u.posts,
        u.is_activated,
        u.id_group,
        u.location,
        u.website_url,
        u.signature,
        mg.group_name,
        mg.online_color
      FROM smf_members u
      LEFT JOIN smf_membergroups mg ON u.id_group = mg.id_group
      ${whereClause}
      ORDER BY u.${sortField} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM smf_members u
      ${whereClause}
    `;

    const [users, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe(usersQuery, ...params),
      this.prisma.$queryRawUnsafe(countQuery, ...params.slice(0, -2)),
    ]);

    const total = Number((countResult as any)[0]?.total || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      users: users as any[],
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async findOne(id: number) {
    const user = await this.prisma.$queryRaw`
      SELECT 
        u.*,
        mg.group_name,
        mg.online_color,
        mg.min_posts,
        COUNT(DISTINCT c.id_critique) as review_count,
        AVG(c.notation) as avg_rating_given
      FROM smf_members u
      LEFT JOIN smf_membergroups mg ON u.id_group = mg.id_group
      LEFT JOIN ak_critique c ON u.id_member = c.id_membre
      WHERE u.id_member = ${id}
      GROUP BY u.id_member, mg.group_name, mg.online_color, mg.min_posts
    `;

    if (!user || (user as any[]).length === 0) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Get user's recent activity
    const recentActivity = await this.prisma.$queryRaw`
      SELECT 
        'review' as type,
        c.date_critique as date,
        c.titre as title,
        CASE 
          WHEN c.id_anime IS NOT NULL AND c.id_anime > 0 THEN 'anime'
          WHEN c.id_manga IS NOT NULL AND c.id_manga > 0 THEN 'manga'
        END as content_type
      FROM ak_critique c
      WHERE c.id_membre = ${id}
      ORDER BY c.date_critique DESC
      LIMIT 10
    `;

    // Convert BigInt values to numbers for JSON serialization
    const userData = (user as any[])[0];
    const convertBigIntToNumber = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'bigint') return Number(obj);
      if (Array.isArray(obj)) return obj.map(convertBigIntToNumber);
      if (typeof obj === 'object') {
        const converted: any = {};
        for (const [key, value] of Object.entries(obj)) {
          converted[key] = convertBigIntToNumber(value);
        }
        return converted;
      }
      return obj;
    };

    return {
      user: convertBigIntToNumber(userData),
      recent_activity: convertBigIntToNumber(recentActivity),
    };
  }

  async update(id: number, updateData: UpdateUserAdminDto, adminId: number) {
    const user = await this.findOne(id);

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Build dynamic update query
    Object.entries(updateData).forEach(([key, value]) => {
      if (
        value !== undefined &&
        key !== 'groups' &&
        key !== 'is_banned' &&
        key !== 'ban_reason'
      ) {
        updateFields.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    });

    if (updateFields.length > 0) {
      const updateQuery = `
        UPDATE smf_members 
        SET ${updateFields.join(', ')}
        WHERE id_member = $${paramIndex}
      `;
      params.push(id);

      await this.prisma.$executeRawUnsafe(updateQuery, ...params);
    }

    // Handle group assignments if provided
    if (updateData.groups && updateData.groups.length > 0) {
      await this.updateUserGroups(id, updateData.groups);
    }

    // Handle ban/unban
    if (updateData.is_banned !== undefined) {
      await this.updateBanStatus(
        id,
        updateData.is_banned,
        updateData.ban_reason,
      );
    }

    // Log the admin action
    await this.logUserAction(
      {
        action: 'edit_profile',
        target_user_id: id,
        reason: 'Profile updated by admin',
        metadata: updateData,
      },
      adminId,
    );

    return this.findOne(id);
  }

  async banUser(id: number, reason: string, adminId: number) {
    await this.prisma.$executeRaw`
      UPDATE smf_members 
      SET is_activated = 0
      WHERE id_member = ${id}
    `;

    // Log the ban action
    await this.logUserAction(
      {
        action: 'ban',
        target_user_id: id,
        reason,
        metadata: { banned_by: adminId },
      },
      adminId,
    );

    return { message: 'User banned successfully' };
  }

  async unbanUser(id: number, adminId: number) {
    await this.prisma.$executeRaw`
      UPDATE smf_members 
      SET is_activated = 1
      WHERE id_member = ${id}
    `;

    // Log the unban action
    await this.logUserAction(
      {
        action: 'unban',
        target_user_id: id,
        reason: 'User unbanned by admin',
        metadata: { unbanned_by: adminId },
      },
      adminId,
    );

    return { message: 'User unbanned successfully' };
  }

  async deleteUser(id: number, adminId: number) {
    // Check if user exists
    const user = await this.findOne(id);

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Don't allow deletion of admin users
    if (user.user.id_group === 1) {
      throw new BadRequestException('Cannot delete administrator users');
    }

    // Delete user's reviews first (cascade)
    await this.prisma.$executeRaw`
      DELETE FROM ak_critique WHERE id_membre = ${id}
    `;

    // Delete the user
    await this.prisma.$executeRaw`
      DELETE FROM smf_members WHERE id_member = ${id}
    `;

    // Log the deletion
    await this.logUserAction(
      {
        action: 'delete',
        target_user_id: id,
        reason: 'User deleted by admin',
        metadata: { deleted_by: adminId },
      },
      adminId,
    );

    return { message: 'User deleted successfully' };
  }

  async searchMembers(query: string, limit: number = 10) {
    if (!query || query.trim().length < 2) {
      return { members: [] };
    }

    const members = await this.prisma.$queryRaw`
      SELECT
        id_member,
        member_name
      FROM smf_members
      WHERE member_name ILIKE ${`%${query.trim()}%`}
      ORDER BY member_name ASC
      LIMIT ${limit}
    `;

    return { members };
  }

  async getUserStats() {
    const stats = await this.prisma.$queryRaw`
      SELECT
        COUNT(*) as total_users,
        COUNT(CASE WHEN is_activated = 1 THEN 1 END) as active_users,
        COUNT(CASE WHEN is_activated = 0 THEN 1 END) as banned_users,
        COUNT(CASE WHEN id_group = 1 THEN 1 END) as admin_users,
        COUNT(CASE WHEN id_group = 2 THEN 1 END) as moderator_users,
        COUNT(CASE WHEN date_registered > EXTRACT(epoch FROM NOW() - interval '30 days')::INTEGER THEN 1 END) as new_users_month
      FROM smf_members
    `;

    const result = (stats as any[])[0];

    // Convert BigInt values to regular numbers for JSON serialization
    return {
      total_users: Number(result.total_users),
      active_users: Number(result.active_users),
      banned_users: Number(result.banned_users),
      admin_users: Number(result.admin_users),
      moderator_users: Number(result.moderator_users),
      new_users_month: Number(result.new_users_month),
    };
  }

  private async updateUserGroups(userId: number, groups: string[]) {
    // This would involve updating membergroup assignments
    // Implementation depends on SMF's membergroup system
    // For now, just update the primary group
    if (groups.length > 0) {
      const groupMapping: Record<string, number> = {
        administrator: 1,
        moderator: 2,
        premium: 4,
        regular: 0,
      };

      const groupId = groupMapping[groups[0]];
      if (groupId !== undefined) {
        await this.prisma.$executeRaw`
          UPDATE smf_members 
          SET id_group = ${groupId}
          WHERE id_member = ${userId}
        `;
      }
    }
  }

  private async updateBanStatus(
    userId: number,
    isBanned: boolean,
    reason?: string,
  ) {
    const activationStatus = isBanned ? 0 : 1;

    await this.prisma.$executeRaw`
      UPDATE smf_members 
      SET is_activated = ${activationStatus}
      WHERE id_member = ${userId}
    `;
  }

  async anonymizeUser(id: number, adminId: number) {
    // Check if user exists
    const user = await this.findOne(id);

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Don't allow anonymization of admin users
    if (user.user.id_group === 1) {
      throw new BadRequestException('Cannot anonymize administrator users');
    }

    // Check if user is already anonymized
    const anonymizedPattern = await this.prisma.$queryRaw<any[]>`
      SELECT member_name
      FROM smf_members
      WHERE id_member = ${id}
      AND member_name LIKE 'anonymized_%'
    `;

    if (anonymizedPattern.length > 0) {
      throw new BadRequestException('User is already anonymized');
    }

    // Generate anonymized data
    const anonymizedName = `anonymized_${id}_${Date.now()}`;
    const anonymizedEmail = `anonymized_${id}@deleted.local`;

    // Anonymize user personal data while keeping contributions
    await this.prisma.$executeRaw`
      UPDATE smf_members
      SET
        member_name = ${anonymizedName},
        real_name = 'Utilisateur anonymisé',
        email_address = ${anonymizedEmail},
        passwd = '',
        password_salt = '',
        personal_text = '',
        avatar = '',
        signature = '',
        website_url = '',
        location = '',
        birthdate = '0001-01-01',
        gender = 0,
        show_online = 0,
        time_format = '',
        time_offset = 0,
        buddy_list = '',
        pm_ignore_list = '',
        message_labels = '',
        lngfile = '',
        secret_question = '',
        secret_answer = '',
        validation_code = '',
        additional_groups = '',
        smiley_set = '',
        member_ip = '',
        member_ip2 = ''
      WHERE id_member = ${id}
    `;

    // Log the anonymization
    await this.logUserAction(
      {
        action: 'anonymize',
        target_user_id: id,
        reason: 'User anonymized for GDPR compliance',
        metadata: {
          anonymized_by: adminId,
          original_username: user.user.member_name,
          anonymized_username: anonymizedName,
        },
      },
      adminId,
    );

    return {
      message: 'User anonymized successfully',
      anonymizedUsername: anonymizedName,
    };
  }

  private async logUserAction(actionLog: UserActionLogDto, adminId: number) {
    // Simple audit logging without request context
    try {
      const metadataJson = actionLog.metadata
        ? JSON.stringify(actionLog.metadata)
        : null;

      await this.prisma.$executeRawUnsafe(
        `
        INSERT INTO admin_audit_log (
          admin_id,
          action,
          target_type,
          target_id,
          reason,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
      `,
        adminId,
        actionLog.action,
        'user',
        actionLog.target_user_id,
        actionLog.reason || null,
        metadataJson,
      );
    } catch (error) {
      console.error('Failed to log user action:', error);
    }
  }
}

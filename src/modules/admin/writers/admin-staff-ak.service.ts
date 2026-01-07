import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { AddStaffAkDto } from './dto/add-staff-ak.dto';
import { StaffAkQueryDto } from './dto/staff-ak-query.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminStaffAkService {
  constructor(private prisma: PrismaService) {}

  async findAllStaffAk(query: StaffAkQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      withoutRole,
      sort = 'user_registered',
      order = 'DESC',
    } = query;
    const offset = (page - 1) * limit;

    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(
        `(wu.user_login ILIKE $${paramIndex} OR wu.user_email ILIKE $${paramIndex} OR wu.display_name ILIKE $${paramIndex})`,
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Add filter for users without roles
    if (withoutRole) {
      whereConditions.push(`ur.id_user_role IS NULL`);
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

    const validSortFields = [
      'ID',
      'user_login',
      'user_email',
      'user_registered',
      'display_name',
    ];
    const sortField = validSortFields.includes(sort) ? sort : 'user_registered';
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

    const staffAkQuery = `
      SELECT
        wu."ID",
        wu.user_login,
        wu.user_nicename,
        wu.user_email,
        wu.user_registered,
        wu.display_name,
        wu.user_status,
        (SELECT COUNT(*) FROM wp_posts WHERE post_author = wu."ID") as article_count
      FROM wp_users wu
      LEFT JOIN ak_user_roles ur ON wu."ID" = ur.user_id AND ur.is_active = true
      ${whereClause}
      ORDER BY wu.${sortField} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const countQuery = `
      SELECT COUNT(DISTINCT wu."ID") as total
      FROM wp_users wu
      LEFT JOIN ak_user_roles ur ON wu."ID" = ur.user_id AND ur.is_active = true
      ${whereClause}
    `;

    const [staffAk, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe(staffAkQuery, ...params),
      this.prisma.$queryRawUnsafe(countQuery, ...params.slice(0, -2)),
    ]);

    const total = Number((countResult as any)[0]?.total || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      staffAk: this.convertBigIntToNumber(staffAk),
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async getSmfMembers(query: any) {
    const {
      page = 1,
      limit = 20,
      search,
      sort = 'date_registered',
      order = 'DESC',
    } = query;
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(
        `(sm.member_name ILIKE $${paramIndex} OR sm.real_name ILIKE $${paramIndex} OR sm.email_address ILIKE $${paramIndex})`,
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

    const validSortFields = [
      'id_member',
      'member_name',
      'email_address',
      'date_registered',
      'posts',
    ];
    const sortField = validSortFields.includes(sort) ? sort : 'date_registered';
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

    const membersQuery = `
      SELECT
        sm.id_member,
        sm.member_name,
        sm.real_name,
        sm.email_address,
        sm.date_registered,
        sm.posts,
        sm.is_activated,
        sm.id_group,
        smg.group_name,
        smg.online_color,
        CASE WHEN wu.user_login IS NOT NULL THEN true ELSE false END as is_staff_ak
      FROM smf_members sm
      LEFT JOIN wp_users wu ON sm.member_name = wu.user_login
      LEFT JOIN smf_membergroups smg ON sm.id_group = smg.id_group
      ${whereClause}
      ORDER BY sm.${sortField} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limitNum, offset);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM smf_members sm
      ${whereClause}
    `;

    const [members, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe(membersQuery, ...params),
      this.prisma.$queryRawUnsafe(countQuery, ...params.slice(0, -2)),
    ]);

    const total = Number((countResult as any)[0]?.total || 0);
    const totalPages = Math.ceil(total / limitNum);

    return {
      members: this.convertBigIntToNumber(members),
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: total,
        hasNext: pageNum < totalPages,
        hasPrevious: pageNum > 1,
      },
    };
  }

  async addSmfMemberAsStaffAk(
    memberId: number,
    addStaffAkDto: AddStaffAkDto,
    adminId: number,
  ) {
    const smfMember = await this.prisma.$queryRaw`
      SELECT * FROM smf_members WHERE id_member = ${memberId}
    `;

    if (!smfMember || (smfMember as any[]).length === 0) {
      throw new NotFoundException(`SMF member with ID ${memberId} not found`);
    }

    const member = (smfMember as any[])[0];

    const existingWriter = await this.prisma.$queryRaw`
      SELECT * FROM wp_users WHERE user_login = ${member.member_name}
    `;

    if (existingWriter && (existingWriter as any[]).length > 0) {
      throw new ConflictException(
        `User ${member.member_name} already exists as staff AK`,
      );
    }

    const userLogin = addStaffAkDto.user_login || member.member_name;
    const userEmail = addStaffAkDto.user_email || member.email_address;
    const userNicename = addStaffAkDto.user_nicename || member.real_name || member.member_name;
    const displayName = addStaffAkDto.display_name || member.real_name || member.member_name;
    const userPass = addStaffAkDto.user_pass || await this.generateRandomPassword();

    const hashedPassword = await bcrypt.hash(userPass, 10);

    // Update the SMF member's group if id_group is provided
    if (addStaffAkDto.id_group !== undefined) {
      await this.prisma.$executeRaw`
        UPDATE smf_members
        SET id_group = ${addStaffAkDto.id_group}
        WHERE id_member = ${memberId}
      `;
    }

    // Fix sequence issue by ensuring it's set to the correct next value
    await this.prisma.$executeRaw`
      SELECT setval(pg_get_serial_sequence('wp_users', 'ID'), COALESCE(MAX("ID"), 0) + 1, false) FROM wp_users
    `;

    const newStaffAk = await this.prisma.$queryRawUnsafe(
      `
      INSERT INTO wp_users (
        user_login,
        user_pass,
        user_nicename,
        user_email,
        user_url,
        user_registered,
        user_activation_key,
        user_status,
        display_name
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)
      RETURNING *
      `,
      userLogin,
      hashedPassword,
      userNicename,
      userEmail,
      addStaffAkDto.user_url || '',
      addStaffAkDto.user_activation_key || '',
      addStaffAkDto.user_status || 0,
      displayName,
    );

    await this.logStaffAkAction(
      {
        action: 'add_staff_ak',
        target_user_id: memberId,
        reason: `Added SMF member ${member.member_name} as staff AK`,
        metadata: {
          smf_member_id: memberId,
          wp_user_login: userLogin,
          id_group_changed: addStaffAkDto.id_group !== undefined ? addStaffAkDto.id_group : null,
          previous_id_group: member.id_group
        },
      },
      adminId,
    );

    return {
      staffAk: this.convertBigIntToNumber((newStaffAk as any[])[0]),
      message: 'Staff AK added successfully',
    };
  }

  async bulkAddSmfMembersAsStaffAk(
    memberIds: number[],
    staffAkOptions: AddStaffAkDto,
    adminId: number,
  ) {
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as { id: number; error: string }[],
    };

    for (const memberId of memberIds) {
      try {
        await this.addSmfMemberAsStaffAk(memberId, staffAkOptions, adminId);
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          id: memberId,
          error: error.message,
        });
      }
    }

    return {
      ...results,
      message: `Bulk operation completed: ${results.successful} successful, ${results.failed} failed`,
    };
  }

  async removeStaffAk(staffAkId: number, adminId: number) {
    const staffAk = await this.prisma.$queryRaw`
      SELECT * FROM wp_users WHERE "ID" = ${staffAkId}
    `;

    if (!staffAk || (staffAk as any[]).length === 0) {
      throw new NotFoundException(`Staff AK with ID ${staffAkId} not found`);
    }

    const staffAkData = (staffAk as any[])[0];

    const articlesCount = await this.prisma.$queryRaw`
      SELECT COUNT(*) as count FROM wp_posts WHERE post_author = ${staffAkId}
    `;

    const count = Number((articlesCount as any[])[0]?.count || 0);

    if (count > 0) {
      throw new BadRequestException(
        `Cannot remove writer with ${count} published articles. Please reassign articles first.`,
      );
    }

    await this.prisma.$executeRaw`
      DELETE FROM wp_users WHERE "ID" = ${staffAkId}
    `;

    await this.logStaffAkAction(
      {
        action: 'remove_staff_ak',
        target_user_id: staffAkId,
        reason: `Removed staff AK ${staffAkData.user_login}`,
        metadata: { wp_user_id: staffAkId, user_login: staffAkData.user_login },
      },
      adminId,
    );

    return { message: 'Staff AK removed successfully' };
  }

  async findOne(staffAkId: number) {
    const staffAk = await this.prisma.$queryRaw`
      SELECT
        wu.*,
        COUNT(DISTINCT wp.ID) as article_count,
        MAX(wp.post_date) as last_article_date
      FROM wp_users wu
      LEFT JOIN wp_posts wp ON wu."ID" = wp.post_author AND wp.post_type = 'post' AND wp.post_status = 'publish'
      WHERE wu."ID" = ${staffAkId}
      GROUP BY wu."ID", wu.user_login, wu.user_pass, wu.user_nicename, wu.user_email, wu.user_url, wu.user_registered, wu.user_activation_key, wu.user_status, wu.display_name
    `;

    if (!staffAk || (staffAk as any[]).length === 0) {
      throw new NotFoundException(`Staff AK with ID ${staffAkId} not found`);
    }

    return {
      staffAk: this.convertBigIntToNumber((staffAk as any[])[0]),
    };
  }

  async getStaffAkStats() {
    // Get staff AK counts
    const staffStats = await this.prisma.$queryRaw`
      SELECT
        COUNT(DISTINCT wu."ID") as total_staff_ak,
        COUNT(DISTINCT CASE WHEN wu.user_registered > NOW() - interval '30 days' THEN wu."ID" END) as staff_ak_added_this_month,
        COUNT(DISTINCT CASE WHEN wp.post_date > NOW() - interval '30 days' THEN wp.ID END) as articles_this_month
      FROM wp_users wu
      LEFT JOIN wp_posts wp ON wu."ID" = wp.post_author AND wp.post_type = 'post' AND wp.post_status = 'publish'
    `;

    // Get SMF members count separately
    const smfStats = await this.prisma.$queryRaw`
      SELECT COUNT(*) as total_smf_members
      FROM smf_members
    `;

    const staffResult = (staffStats as any[])[0];
    const smfResult = (smfStats as any[])[0];

    return {
      total_staff_ak: Number(staffResult.total_staff_ak),
      total_smf_members: Number(smfResult.total_smf_members),
      staff_ak_added_this_month: Number(staffResult.staff_ak_added_this_month),
      articles_this_month: Number(staffResult.articles_this_month),
    };
  }

  async getSmfMembergroups() {
    try {
      const membergroups = await this.prisma.$queryRaw`
        SELECT * FROM smf_membergroups ORDER BY id_group ASC
      `;
      return this.convertBigIntToNumber(membergroups);
    } catch (error) {
      console.error('Failed to fetch SMF membergroups:', error);
      return [];
    }
  }

  async updateSmfMemberGroup(memberId: number, newGroupId: number, adminId: number) {
    // Check if the member exists
    const smfMember = await this.prisma.$queryRaw`
      SELECT * FROM smf_members WHERE id_member = ${memberId}
    `;

    if (!smfMember || (smfMember as any[]).length === 0) {
      throw new NotFoundException(`SMF member with ID ${memberId} not found`);
    }

    const member = (smfMember as any[])[0];
    const previousGroupId = member.id_group;

    // Update the member's group
    await this.prisma.$executeRaw`
      UPDATE smf_members
      SET id_group = ${newGroupId}
      WHERE id_member = ${memberId}
    `;

    // Log the action
    await this.logStaffAkAction(
      {
        action: 'update_member_group',
        target_user_id: memberId,
        reason: `Updated SMF member ${member.member_name} group from ${previousGroupId} to ${newGroupId}`,
        metadata: {
          smf_member_id: memberId,
          previous_id_group: previousGroupId,
          new_id_group: newGroupId,
          member_name: member.member_name
        },
      },
      adminId,
    );

    return {
      message: 'Member group updated successfully',
      member: {
        id_member: memberId,
        member_name: member.member_name,
        previous_id_group: previousGroupId,
        new_id_group: newGroupId
      }
    };
  }

  private async generateRandomPassword(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private convertBigIntToNumber(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return Number(obj);
    if (Array.isArray(obj)) return obj.map((item) => this.convertBigIntToNumber(item));
    if (typeof obj === 'object') {
      const converted: any = {};
      for (const [key, value] of Object.entries(obj)) {
        converted[key] = this.convertBigIntToNumber(value);
      }
      return converted;
    }
    return obj;
  }

  private async logStaffAkAction(actionLog: any, adminId: number) {
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
        'staff_ak',
        actionLog.target_user_id,
        actionLog.reason || null,
        metadataJson,
      );
    } catch (error) {
      console.error('Failed to log staff AK action:', error);
    }
  }
}
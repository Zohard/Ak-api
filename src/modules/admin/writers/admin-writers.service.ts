import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { AddWriterDto } from './dto/add-writer.dto';
import { WriterQueryDto } from './dto/writer-query.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminWritersService {
  constructor(private prisma: PrismaService) {}

  async findAllWriters(query: WriterQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      sort = 'user_registered',
      order = 'DESC',
    } = query;
    const offset = (page - 1) * limit;

    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(
        `(user_login ILIKE $${paramIndex} OR user_email ILIKE $${paramIndex} OR display_name ILIKE $${paramIndex})`,
      );
      params.push(`%${search}%`);
      paramIndex++;
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

    const writersQuery = `
      SELECT
        "ID",
        user_login,
        user_nicename,
        user_email,
        user_registered,
        display_name,
        user_status,
        (SELECT COUNT(*) FROM wp_posts WHERE post_author = wp_users."ID") as article_count
      FROM wp_users
      ${whereClause}
      ORDER BY ${sortField} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM wp_users
      ${whereClause}
    `;

    const [writers, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe(writersQuery, ...params),
      this.prisma.$queryRawUnsafe(countQuery, ...params.slice(0, -2)),
    ]);

    const total = Number((countResult as any)[0]?.total || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      writers: this.convertBigIntToNumber(writers),
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
    const offset = (page - 1) * limit;

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
        CASE WHEN wu.user_login IS NOT NULL THEN true ELSE false END as is_writer
      FROM smf_members sm
      LEFT JOIN wp_users wu ON sm.member_name = wu.user_login
      ${whereClause}
      ORDER BY sm.${sortField} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

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
    const totalPages = Math.ceil(total / limit);

    return {
      members: this.convertBigIntToNumber(members),
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async addSmfMemberAsWriter(
    memberId: number,
    addWriterDto: AddWriterDto,
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
        `User ${member.member_name} already exists as a writer`,
      );
    }

    const userLogin = addWriterDto.user_login || member.member_name;
    const userEmail = addWriterDto.user_email || member.email_address;
    const userNicename = addWriterDto.user_nicename || member.real_name || member.member_name;
    const displayName = addWriterDto.display_name || member.real_name || member.member_name;
    const userPass = addWriterDto.user_pass || await this.generateRandomPassword();

    const hashedPassword = await bcrypt.hash(userPass, 10);

    const newWriter = await this.prisma.$queryRawUnsafe(
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
      addWriterDto.user_url || '',
      addWriterDto.user_activation_key || '',
      addWriterDto.user_status || 0,
      displayName,
    );

    await this.logWriterAction(
      {
        action: 'add_writer',
        target_user_id: memberId,
        reason: `Added SMF member ${member.member_name} as writer`,
        metadata: { smf_member_id: memberId, wp_user_login: userLogin },
      },
      adminId,
    );

    return {
      writer: this.convertBigIntToNumber((newWriter as any[])[0]),
      message: 'Writer added successfully',
    };
  }

  async bulkAddSmfMembersAsWriters(
    memberIds: number[],
    writerOptions: AddWriterDto,
    adminId: number,
  ) {
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as { id: number; error: string }[],
    };

    for (const memberId of memberIds) {
      try {
        await this.addSmfMemberAsWriter(memberId, writerOptions, adminId);
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

  async removeWriter(writerId: number, adminId: number) {
    const writer = await this.prisma.$queryRaw`
      SELECT * FROM wp_users WHERE "ID" = ${writerId}
    `;

    if (!writer || (writer as any[]).length === 0) {
      throw new NotFoundException(`Writer with ID ${writerId} not found`);
    }

    const writerData = (writer as any[])[0];

    const articlesCount = await this.prisma.$queryRaw`
      SELECT COUNT(*) as count FROM wp_posts WHERE post_author = ${writerId}
    `;

    const count = Number((articlesCount as any[])[0]?.count || 0);

    if (count > 0) {
      throw new BadRequestException(
        `Cannot remove writer with ${count} published articles. Please reassign articles first.`,
      );
    }

    await this.prisma.$executeRaw`
      DELETE FROM wp_users WHERE "ID" = ${writerId}
    `;

    await this.logWriterAction(
      {
        action: 'remove_writer',
        target_user_id: writerId,
        reason: `Removed writer ${writerData.user_login}`,
        metadata: { wp_user_id: writerId, user_login: writerData.user_login },
      },
      adminId,
    );

    return { message: 'Writer removed successfully' };
  }

  async findOne(writerId: number) {
    const writer = await this.prisma.$queryRaw`
      SELECT
        wu.*,
        COUNT(DISTINCT wp.ID) as article_count,
        MAX(wp.post_date) as last_article_date
      FROM wp_users wu
      LEFT JOIN wp_posts wp ON wu."ID" = wp.post_author AND wp.post_type = 'post' AND wp.post_status = 'publish'
      WHERE wu."ID" = ${writerId}
      GROUP BY wu."ID", wu.user_login, wu.user_pass, wu.user_nicename, wu.user_email, wu.user_url, wu.user_registered, wu.user_activation_key, wu.user_status, wu.display_name
    `;

    if (!writer || (writer as any[]).length === 0) {
      throw new NotFoundException(`Writer with ID ${writerId} not found`);
    }

    return {
      writer: this.convertBigIntToNumber((writer as any[])[0]),
    };
  }

  async getWriterStats() {
    const stats = await this.prisma.$queryRaw`
      SELECT
        COUNT(DISTINCT wu."ID") as total_writers,
        COUNT(DISTINCT sm.id_member) as total_smf_members,
        COUNT(DISTINCT CASE WHEN wu.user_registered > NOW() - interval '30 days' THEN wu."ID" END) as writers_added_this_month,
        COUNT(DISTINCT CASE WHEN wp.post_date > NOW() - interval '30 days' THEN wp.ID END) as articles_this_month
      FROM wp_users wu
      CROSS JOIN smf_members sm
      LEFT JOIN wp_posts wp ON wu."ID" = wp.post_author AND wp.post_type = 'post' AND wp.post_status = 'publish'
    `;

    const result = (stats as any[])[0];

    return {
      total_writers: Number(result.total_writers),
      total_smf_members: Number(result.total_smf_members),
      writers_added_this_month: Number(result.writers_added_this_month),
      articles_this_month: Number(result.articles_this_month),
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

  private async logWriterAction(actionLog: any, adminId: number) {
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
        'writer',
        actionLog.target_user_id,
        actionLog.reason || null,
        metadataJson,
      );
    } catch (error) {
      console.error('Failed to log writer action:', error);
    }
  }
}
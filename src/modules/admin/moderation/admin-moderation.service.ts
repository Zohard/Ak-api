import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import {
  ReviewModerationActionDto,
  BulkModerationDto,
  ModerationQueueQueryDto,
} from './dto/review-moderation.dto';
import {
  ContentModerationActionDto,
  ReportContentDto,
  ModerationReportQueryDto,
} from './dto/content-moderation.dto';

@Injectable()
export class AdminModerationService {
  constructor(private prisma: PrismaService) {}

  // Review Moderation
  async getModerationQueue(query: ModerationQueueQueryDto) {
    const {
      page = 1,
      limit = 20,
      status = 'pending',
      contentType = 'all',
      search,
    } = query;
    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Status filter
    if (status !== 'all') {
      const statusMap = {
        pending: 1,
        approved: 0,
        rejected: 2,
      };
      whereConditions.push(`c.statut = $${paramIndex}`);
      params.push(statusMap[status]);
      paramIndex++;
    }

    // Content type filter
    if (contentType !== 'all') {
      if (contentType === 'anime') {
        whereConditions.push(`c.id_anime IS NOT NULL`);
      } else if (contentType === 'manga') {
        whereConditions.push(`c.id_manga IS NOT NULL`);
      }
    }

    // Search filter
    if (search) {
      whereConditions.push(
        `(c.titre ILIKE $${paramIndex} OR c.critique ILIKE $${paramIndex})`,
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

    // Get reviews in moderation queue
    const reviewsQuery = `
      SELECT 
        c.id,
        c.titre,
        c.critique,
        c.notation,
        c.date_critique,
        c.statut,
        c.id_anime,
        c.id_manga,
        c.id_membre,
        u.member_name as author_name,
        u.real_name as author_display_name,
        CASE 
          WHEN c.id_anime IS NOT NULL THEN a.titre
          WHEN c.id_manga IS NOT NULL THEN m.titre
        END as content_title,
        CASE 
          WHEN c.id_anime IS NOT NULL THEN 'anime'
          WHEN c.id_manga IS NOT NULL THEN 'manga'
        END as content_type
      FROM ak_critique c
      LEFT JOIN smf_members u ON c.id_membre = u.id_member
      LEFT JOIN ak_animes a ON c.id_anime = a.id_anime
      LEFT JOIN ak_mangas m ON c.id_manga = m.id_manga
      ${whereClause}
      ORDER BY c.date_critique DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM ak_critique c
      LEFT JOIN smf_members u ON c.id_membre = u.id_member
      LEFT JOIN ak_animes a ON c.id_anime = a.id_anime
      LEFT JOIN ak_mangas m ON c.id_manga = m.id_manga
      ${whereClause}
    `;

    const [reviews, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe(reviewsQuery, ...params),
      this.prisma.$queryRawUnsafe(countQuery, ...params.slice(0, -2)),
    ]);

    const total = Number((countResult as any)[0]?.total || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      reviews: reviews as any[],
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async moderateReview(
    reviewId: number,
    actionDto: ReviewModerationActionDto,
    moderatorId: number,
  ) {
    const { action, reason, new_title, new_content, new_rating } = actionDto;

    // Check if review exists
    const review = await this.prisma.$queryRaw`
      SELECT * FROM ak_critique WHERE id = ${reviewId}
    `;

    if (!review || (review as any[]).length === 0) {
      throw new NotFoundException(`Review with ID ${reviewId} not found`);
    }

    const reviewData = (review as any[])[0];

    switch (action) {
      case 'approve':
        await this.prisma.$queryRaw`
          UPDATE ak_critique 
          SET statut = 0, moderated_by = ${moderatorId}, moderated_at = ${Math.floor(Date.now() / 1000)}
          WHERE id = ${reviewId}
        `;
        // Update content rating statistics
        await this.updateContentRatingStats(
          reviewData.anime_id,
          reviewData.manga_id,
        );
        break;

      case 'reject':
        await this.prisma.$queryRaw`
          UPDATE ak_critique 
          SET statut = 2, moderated_by = ${moderatorId}, moderated_at = ${Math.floor(Date.now() / 1000)},
              moderation_reason = ${reason || 'Rejected'}
          WHERE id = ${reviewId}
        `;
        break;

      case 'delete':
        await this.prisma.$queryRaw`
          DELETE FROM ak_critique WHERE id = ${reviewId}
        `;
        // Update content rating statistics
        await this.updateContentRatingStats(
          reviewData.anime_id,
          reviewData.manga_id,
        );
        break;

      case 'edit':
        const updateFields: string[] = [];
        const updateParams: any[] = [];
        let updateParamIndex = 1;

        if (new_title) {
          updateFields.push(`titre = $${updateParamIndex}`);
          updateParams.push(new_title);
          updateParamIndex++;
        }

        if (new_content) {
          updateFields.push(`critique = $${updateParamIndex}`);
          updateParams.push(new_content);
          updateParamIndex++;
        }

        if (new_rating !== undefined) {
          updateFields.push(`notation = $${updateParamIndex}`);
          updateParams.push(new_rating);
          updateParamIndex++;
        }

        if (updateFields.length > 0) {
          updateFields.push(`moderated_by = $${updateParamIndex}`);
          updateParams.push(moderatorId);
          updateParamIndex++;

          updateFields.push(`moderated_at = $${updateParamIndex}`);
          updateParams.push(Math.floor(Date.now() / 1000));
          updateParamIndex++;

          updateFields.push(`statut = $${updateParamIndex}`);
          updateParams.push(0); // Approve after edit
          updateParamIndex++;

          const updateQuery = `
            UPDATE ak_critique 
            SET ${updateFields.join(', ')}
            WHERE id = $${updateParamIndex}
          `;
          updateParams.push(reviewId);

          await this.prisma.$executeRawUnsafe(updateQuery, ...updateParams);
          // Update content rating statistics
          await this.updateContentRatingStats(
            reviewData.anime_id,
            reviewData.manga_id,
          );
        }
        break;

      default:
        throw new BadRequestException('Invalid moderation action');
    }

    // Log moderation action
    await this.logModerationAction({
      moderator_id: moderatorId,
      action,
      target_type: 'review',
      target_id: reviewId,
      reason,
      metadata: { new_title, new_content, new_rating },
    });

    return { message: `Review ${action}ed successfully` };
  }

  async bulkModerateReviews(
    bulkActionDto: BulkModerationDto,
    moderatorId: number,
  ) {
    const { reviewIds, action, reason } = bulkActionDto;
    const results: Array<{
      reviewId: number;
      status: string;
      message: string;
    }> = [];

    for (const reviewId of reviewIds) {
      try {
        await this.moderateReview(reviewId, { action, reason }, moderatorId);
        results.push({
          reviewId,
          status: 'success',
          message: `${action}ed successfully`,
        });
      } catch (error) {
        results.push({
          reviewId,
          status: 'error',
          message: error.message || 'Unknown error',
        });
      }
    }

    return {
      message: 'Bulk moderation completed',
      results,
    };
  }

  // Content Moderation & Reporting
  async reportContent(reportDto: ReportContentDto, reporterId: number) {
    const { contentType, contentId, reason, details } = reportDto;

    // Verify content exists
    await this.verifyContentExists(contentType, contentId);

    // Create report
    await this.prisma.$queryRaw`
      INSERT INTO moderation_reports (
        reporter_id,
        content_type,
        content_id,
        reason,
        details,
        status,
        created_at
      ) VALUES (
        ${reporterId},
        ${contentType},
        ${contentId},
        ${reason},
        ${details || null},
        'pending',
        ${Math.floor(Date.now() / 1000)}
      )
    `;

    return { message: 'Content reported successfully' };
  }

  async getModerationReports(query: ModerationReportQueryDto) {
    const {
      page = 1,
      limit = 20,
      status = 'pending',
      contentType = 'all',
      reason,
    } = query;
    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (status !== 'all') {
      whereConditions.push(`mr.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (contentType !== 'all') {
      whereConditions.push(`mr.content_type = $${paramIndex}`);
      params.push(contentType);
      paramIndex++;
    }

    if (reason) {
      whereConditions.push(`mr.reason = $${paramIndex}`);
      params.push(reason);
      paramIndex++;
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

    const reportsQuery = `
      SELECT 
        mr.*,
        u.member_name as reporter_name,
        m.member_name as moderator_name
      FROM moderation_reports mr
      LEFT JOIN smf_members u ON mr.reporter_id = u.id_member
      LEFT JOIN smf_members m ON mr.moderator_id = m.id_manga_member
      ${whereClause}
      ORDER BY mr.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const reports = await this.prisma.$queryRawUnsafe(reportsQuery, ...params);

    return {
      reports: reports as any[],
      pagination: {
        currentPage: page,
        totalPages: Math.ceil((reports as any[]).length / limit),
        totalItems: (reports as any[]).length,
      },
    };
  }

  async processContentReport(
    reportId: number,
    actionDto: ContentModerationActionDto,
    moderatorId: number,
  ) {
    const { action, reason } = actionDto;

    // Update report status
    await this.prisma.$queryRaw`
      UPDATE moderation_reports 
      SET status = 'reviewed',
          moderator_id = ${moderatorId},
          moderator_action = ${action},
          moderator_reason = ${reason || null},
          resolved_at = ${Math.floor(Date.now() / 1000)}
      WHERE id = ${reportId}
    `;

    // Take action on reported content if needed
    if (action === 'approve' || action === 'reject') {
      // Implement content action logic here
    }

    return { message: 'Report processed successfully' };
  }

  async getModerationStats() {
    const stats = await this.prisma.$queryRaw`
      SELECT 
        (SELECT COUNT(*) FROM ak_critique WHERE statut = 1) as pending_reviews,
        (SELECT COUNT(*) FROM ak_critique WHERE statut = 0) as approved_reviews,
        (SELECT COUNT(*) FROM ak_critique WHERE statut = 2) as rejected_reviews,
        (SELECT COUNT(*) FROM smf_log_reported WHERE closed = 0) as pending_reports,
        (SELECT COUNT(*) FROM smf_log_reported WHERE closed = 1) as resolved_reports
    `;

    const result = (stats as any[])[0];

    // Convert BigInt values to regular numbers for JSON serialization
    return {
      pending_reviews: Number(result.pending_reviews),
      approved_reviews: Number(result.approved_reviews),
      rejected_reviews: Number(result.rejected_reviews),
      pending_reports: Number(result.pending_reports),
      resolved_reports: Number(result.resolved_reports),
    };
  }

  // Helper methods
  private async updateContentRatingStats(animeId?: number, mangaId?: number) {
    if (animeId) {
      await this.prisma.$queryRaw`
        UPDATE ak_animes 
        SET 
          note_moyenne = (
            SELECT AVG(notation)::DECIMAL(3,2) 
            FROM ak_critique 
            WHERE anime_id = ${animeId} AND statut = 0
          ),
          nb_critiques = (
            SELECT COUNT(*) 
            FROM ak_critique 
            WHERE anime_id = ${animeId} AND statut = 0
          )
        WHERE id = ${animeId}
      `;
    }

    if (mangaId) {
      await this.prisma.$queryRaw`
        UPDATE ak_mangas 
        SET 
          note_moyenne = (
            SELECT AVG(notation)::DECIMAL(3,2) 
            FROM ak_critique 
            WHERE manga_id = ${mangaId} AND statut = 0
          ),
          nb_critiques = (
            SELECT COUNT(*) 
            FROM ak_critique 
            WHERE manga_id = ${mangaId} AND statut = 0
          )
        WHERE id = ${mangaId}
      `;
    }
  }

  private async verifyContentExists(contentType: string, contentId: number) {
    const tableMap = {
      anime: 'ak_animes',
      manga: 'ak_mangas',
      business: 'ak_business',
      article: 'ak_webzine_articles',
      review: 'ak_critique',
      user: 'smf_members',
    };

    const tableName = tableMap[contentType];
    if (!tableName) {
      throw new BadRequestException('Invalid content type');
    }

    const idColumn = contentType === 'user' ? 'id_member' : 'id';
    const content = await this.prisma.$queryRawUnsafe(
      `SELECT 1 FROM ${tableName} WHERE ${idColumn} = $1`,
      contentId,
    );

    if (!content || (content as any[]).length === 0) {
      throw new NotFoundException(
        `${contentType} with ID ${contentId} not found`,
      );
    }
  }

  private async logModerationAction(actionLog: {
    moderator_id: number;
    action: string;
    target_type: string;
    target_id: number;
    reason?: string;
    metadata?: any;
  }) {
    // Simple moderation logging
    try {
      await this.prisma.$queryRaw`
        INSERT INTO moderation_log (
          moderator_id,
          action,
          target_type,
          target_id,
          reason,
          metadata,
          created_at
        ) VALUES (
          ${actionLog.moderator_id},
          ${actionLog.action},
          ${actionLog.target_type},
          ${actionLog.target_id},
          ${actionLog.reason || null},
          ${actionLog.metadata ? JSON.stringify(actionLog.metadata) : null},
          NOW()
        )
      `;
    } catch (error) {
      console.error('Failed to log moderation action:', error);
    }
  }
}

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CacheService } from '../../../shared/services/cache.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentQueryDto } from './dto/comment-query.dto';
import { ModerateCommentDto } from './dto/moderate-comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  /**
   * Convert WordPress comment_approved values to moderation status
   * '1' = Approved (1)
   * '0' = Pending (0)
   * 'spam' = Rejected/Spam (2)
   */
  private getModerationStatus(commentApproved: string): number {
    if (commentApproved === '1') return 1;
    if (commentApproved === 'spam') return 2;
    return 0; // Default: pending
  }

  /**
   * Get SMF member email address
   * Used to link comments for users without WordPress accounts
   */
  private async getSmfMemberEmail(smfUserId: number): Promise<string | undefined> {
    const smfMember = await this.prisma.smfMember.findUnique({
      where: { idMember: smfUserId },
      select: { emailAddress: true }
    });

    return smfMember?.emailAddress;
  }

  /**
   * Get SMF member avatar by email
   * Returns the avatar URL if available
   */
  private async getSmfMemberAvatar(email: string | null): Promise<string | undefined> {
    if (!email) return undefined;

    const smfMember = await this.prisma.smfMember.findFirst({
      where: { emailAddress: email },
      select: { avatar: true }
    });

    return smfMember?.avatar || undefined;
  }

  /**
   * Convert SMF member ID to wp_users ID by email lookup
   * This is needed because the system uses SMF for authentication but WordPress for comments
   * Returns undefined if no WP account exists (user will be linked by email instead)
   */
  private async convertSmfIdToWpId(smfUserId: number): Promise<number | undefined> {
    const email = await this.getSmfMemberEmail(smfUserId);
    if (!email) return undefined;

    const wpUser = await this.prisma.wpUser.findFirst({
      where: { userEmail: email }
    });

    return wpUser ? Number(wpUser.ID) : undefined;
  }

  async create(
    createCommentDto: CreateCommentDto,
    userId?: number,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<any> {
    // Verify the article exists
    const article = await this.prisma.wpPost.findUnique({
      where: { ID: BigInt(createCommentDto.articleId) },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    let wpUserId = 0;
    let authorName = 'Anonymous';
    let authorEmail = '';

    // If user is logged in (SMF member), get their info and check for wp_users
    if (userId && createCommentDto.email) {
      // Try to find corresponding wp_users record by email
      const wpUser = await this.prisma.wpUser.findFirst({
        where: { userEmail: createCommentDto.email }
      });

      if (wpUser) {
        wpUserId = Number(wpUser.ID);
      }

      // Use the provided name and email from SMF member
      authorName = createCommentDto.nom || 'Anonymous';
      authorEmail = createCommentDto.email;
    } else if (createCommentDto.nom && createCommentDto.email) {
      // Anonymous comment with name and email provided
      authorName = createCommentDto.nom;
      authorEmail = createCommentDto.email;
    }

    // Create the comment
    const comment = await this.prisma.wpComment.create({
      data: {
        commentPostID: BigInt(createCommentDto.articleId),
        commentAuthor: authorName,
        commentAuthorEmail: authorEmail,
        commentAuthorUrl: createCommentDto.website || '',
        commentAuthorIP: ipAddress || '',
        commentContent: createCommentDto.commentaire || '',
        commentDate: new Date(),
        commentDateGmt: new Date(),
        commentApproved: userId ? '1' : '0', // Auto-approve for logged users
        commentAgent: userAgent || '',
        commentType: '',
        commentParent: BigInt(0),
        userId: wpUserId,
      },
    });

    // Invalidate comments cache for this article
    await this.invalidateCommentsCache(createCommentDto.articleId);

    return {
      id: Number(comment.commentID),
      articleId: Number(comment.commentPostID),
      userId: comment.userId,
      nom: comment.commentAuthor,
      email: comment.commentAuthorEmail,
      website: comment.commentAuthorUrl,
      commentaire: comment.commentContent,
      date: comment.commentDate.toISOString(),
      moderation: this.getModerationStatus(comment.commentApproved),
    };
  }

  async findAll(
    query: CommentQueryDto,
    includePrivateFields: boolean = false,
    requestingUserId?: number,
  ) {
    const {
      page = 1,
      limit = 20,
      articleId,
      userId,
      status,
      sort = 'commentDate',
      order = 'desc',
    } = query;

    // Generate cache key for approved comments (public queries only)
    const shouldCache = !includePrivateFields && status === 'approved' && articleId;
    const cacheKey = shouldCache ? `comments:article:${articleId}:p${page}:l${limit}:s${sort}:o${order}` : '';

    if (shouldCache) {
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Get SMF user's WP ID and email for ownership checking
    let wpUserId: number | undefined;
    let smfUserEmail: string | undefined;
    if (requestingUserId) {
      smfUserEmail = await this.getSmfMemberEmail(requestingUserId);
      wpUserId = await this.convertSmfIdToWpId(requestingUserId);
    }

    const offset = (page - 1) * limit;

    // Build where conditions
    const where: any = {};

    if (articleId) {
      where.commentPostID = BigInt(articleId);
    }

    if (userId) {
      where.userId = userId;
    }

    if (status === 'approved') {
      where.commentApproved = '1';
    } else if (status === 'pending') {
      where.commentApproved = '0';
    } else if (status === 'spam') {
      where.commentApproved = 'spam';
    }

    // Sort configuration
    const orderBy: any = {};
    orderBy[sort] = order.toLowerCase();

    const [comments, total] = await Promise.all([
      this.prisma.wpComment.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
      }),
      this.prisma.wpComment.count({ where }),
    ]);

    const transformedComments = await Promise.all(comments.map(async (comment) => {
      // Fetch avatar from SMF members
      const avatar = await this.getSmfMemberAvatar(comment.commentAuthorEmail);

      const baseComment = {
        id: Number(comment.commentID),
        articleId: Number(comment.commentPostID),
        userId: comment.userId,
        nom: comment.commentAuthor,
        website: comment.commentAuthorUrl,
        commentaire: comment.commentContent,
        date: comment.commentDate.toISOString(),
        avatar: avatar || null,
      };

      if (includePrivateFields) {
        return {
          ...baseComment,
          email: comment.commentAuthorEmail,
          moderation: this.getModerationStatus(comment.commentApproved),
          ip: comment.commentAuthorIP,
        };
      }

      // Include email and moderation for comment owner (even if not admin)
      // This allows them to edit/delete their own comments and see moderation status
      // Check ownership by EITHER:
      // 1. WP user_id match (for users WITH WordPress accounts)
      // 2. Email match (for users WITHOUT WordPress accounts, user_id = 0)
      const isOwner =
        (wpUserId && comment.userId === wpUserId) ||
        (smfUserEmail && comment.commentAuthorEmail === smfUserEmail);

      if (isOwner) {
        return {
          ...baseComment,
          email: comment.commentAuthorEmail,
          moderation: this.getModerationStatus(comment.commentApproved),
        };
      }

      return baseComment;
    }));

    const totalPages = Math.ceil(total / limit);

    const result = {
      comments: transformedComments,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };

    // Cache the result for approved comments (20 minutes)
    if (shouldCache) {
      await this.cacheService.set(cacheKey, result, 1200);
    }

    return result;
  }

  async findOne(id: number, includePrivateFields: boolean = false): Promise<any> {
    const comment = await this.prisma.wpComment.findUnique({
      where: { commentID: BigInt(id) },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const baseComment = {
      id: Number(comment.commentID),
      articleId: Number(comment.commentPostID),
      userId: comment.userId,
      nom: comment.commentAuthor,
      website: comment.commentAuthorUrl,
      commentaire: comment.commentContent,
      date: comment.commentDate.toISOString(),
    };

    if (includePrivateFields) {
      return {
        ...baseComment,
        email: comment.commentAuthorEmail,
        moderation: this.getModerationStatus(comment.commentApproved),
        ip: comment.commentAuthorIP,
      };
    }

    return baseComment;
  }

  async update(
    id: number,
    updateCommentDto: UpdateCommentDto,
    userId: number,
    isAdmin: boolean,
  ): Promise<any> {
    const existingComment = await this.prisma.wpComment.findUnique({
      where: { commentID: BigInt(id) },
    });

    if (!existingComment) {
      throw new NotFoundException('Comment not found');
    }

    // Get SMF user's WP ID and email for permission check
    const smfUserEmail = await this.getSmfMemberEmail(userId);
    const wpUserId = await this.convertSmfIdToWpId(userId);

    // Check permissions - user owns comment if EITHER:
    // 1. WP user_id matches (users WITH WordPress accounts)
    // 2. Email matches (users WITHOUT WordPress accounts, user_id = 0)
    const isOwner =
      (wpUserId && existingComment.userId === wpUserId) ||
      (smfUserEmail && existingComment.commentAuthorEmail === smfUserEmail);

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    const updateData: any = {};
    if (updateCommentDto.commentaire) {
      updateData.commentContent = updateCommentDto.commentaire;
    }

    const updatedComment = await this.prisma.wpComment.update({
      where: { commentID: BigInt(id) },
      data: updateData,
    });

    // Invalidate comments cache for this article
    await this.invalidateCommentsCache(Number(updatedComment.commentPostID));

    return {
      id: Number(updatedComment.commentID),
      articleId: Number(updatedComment.commentPostID),
      userId: updatedComment.userId,
      nom: updatedComment.commentAuthor,
      email: updatedComment.commentAuthorEmail,
      website: updatedComment.commentAuthorUrl,
      commentaire: updatedComment.commentContent,
      date: updatedComment.commentDate.toISOString(),
      moderation: this.getModerationStatus(updatedComment.commentApproved),
    };
  }

  async moderate(
    id: number,
    moderateDto: ModerateCommentDto,
    userId: number,
    isAdmin: boolean,
  ): Promise<any> {
    if (!isAdmin) {
      throw new ForbiddenException('Only administrators can moderate comments');
    }

    const comment = await this.prisma.wpComment.findUnique({
      where: { commentID: BigInt(id) },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    let commentApproved = '0';
    if (moderateDto.action === 'approve') {
      commentApproved = '1';
    } else if (moderateDto.action === 'reject') {
      commentApproved = 'spam';
    }

    await this.prisma.wpComment.update({
      where: { commentID: BigInt(id) },
      data: { commentApproved },
    });

    // Invalidate comments cache for this article
    await this.invalidateCommentsCache(Number(comment.commentPostID));

    return { message: `Comment ${moderateDto.action}d successfully` };
  }

  async getById(id: number, includePrivateFields: boolean = false): Promise<any> {
    return this.findOne(id, includePrivateFields);
  }

  async bulkModerate(
    commentIds: number[],
    status: string,
    reason?: string,
  ): Promise<any> {
    const action = status === 'approved' ? 'approve' : status === 'rejected' ? 'reject' : 'pending';
    
    const results = await Promise.all(
      commentIds.map(async (id) => {
        try {
          await this.prisma.wpComment.update({
            where: { commentID: BigInt(id) },
            data: { commentApproved: status === 'approved' ? '1' : status === 'rejected' ? 'spam' : '0' },
          });
          return { id, success: true };
        } catch (error) {
          return { id, success: false, error: error.message };
        }
      })
    );

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      message: `Bulk moderation completed. ${successful} successful, ${failed} failed.`,
      results,
    };
  }

  async remove(id: number, userId: number, isAdmin: boolean): Promise<any> {
    const comment = await this.prisma.wpComment.findUnique({
      where: { commentID: BigInt(id) },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    // Get SMF user's WP ID and email for permission check
    const smfUserEmail = await this.getSmfMemberEmail(userId);
    const wpUserId = await this.convertSmfIdToWpId(userId);

    // Check permissions - user owns comment if EITHER:
    // 1. WP user_id matches (users WITH WordPress accounts)
    // 2. Email matches (users WITHOUT WordPress accounts, user_id = 0)
    const isOwner =
      (wpUserId && comment.userId === wpUserId) ||
      (smfUserEmail && comment.commentAuthorEmail === smfUserEmail);

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    await this.prisma.wpComment.delete({
      where: { commentID: BigInt(id) },
    });

    // Invalidate comments cache for this article
    await this.invalidateCommentsCache(Number(comment.commentPostID));

    return { message: 'Comment deleted successfully' };
  }

  async getStats() {
    const stats = await this.prisma.$queryRaw`
      SELECT 
        (SELECT COUNT(*) FROM wp_comments WHERE comment_approved = '1') as approved_comments,
        (SELECT COUNT(*) FROM wp_comments WHERE comment_approved = '0') as pending_comments,
        (SELECT COUNT(*) FROM wp_comments WHERE comment_approved = 'spam') as rejected_comments,
        (SELECT COUNT(*) FROM wp_comments WHERE user_id > 0) as member_comments,
        (SELECT COUNT(*) FROM wp_comments WHERE user_id = 0) as anonymous_comments
    `;

    const result = (stats as any[])[0];

    return {
      approved_comments: Number(result.approved_comments),
      pending_comments: Number(result.pending_comments),
      rejected_comments: Number(result.rejected_comments),
      member_comments: Number(result.member_comments),
      anonymous_comments: Number(result.anonymous_comments),
    };
  }

  // Cache invalidation helper
  private async invalidateCommentsCache(articleId: number): Promise<void> {
    // Invalidate all cache entries for this article's comments
    await this.cacheService.delByPattern(`comments:article:${articleId}:*`);
  }
}
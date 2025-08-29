import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentQueryDto } from './dto/comment-query.dto';
import { ModerateCommentDto } from './dto/moderate-comment.dto';

@Injectable()
export class CommentsService {
  constructor(private prisma: PrismaService) {}

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

    // Create the comment
    const comment = await this.prisma.wpComment.create({
      data: {
        commentPostID: BigInt(createCommentDto.articleId),
        commentAuthor: createCommentDto.nom || 'Anonymous',
        commentAuthorEmail: createCommentDto.email || '',
        commentAuthorUrl: createCommentDto.website || '',
        commentAuthorIP: ipAddress || '',
        commentContent: createCommentDto.commentaire || '',
        commentDate: new Date(),
        commentDateGmt: new Date(),
        commentApproved: userId ? '1' : '0', // Auto-approve for logged users
        commentAgent: userAgent || '',
        commentType: '',
        commentParent: BigInt(0),
        userId: userId || 0,
      },
    });

    return {
      id: Number(comment.commentID),
      articleId: Number(comment.commentPostID),
      userId: comment.userId,
      nom: comment.commentAuthor,
      email: comment.commentAuthorEmail,
      website: comment.commentAuthorUrl,
      commentaire: comment.commentContent,
      date: comment.commentDate.toISOString(),
      moderation: comment.commentApproved === '1' ? 1 : 0,
    };
  }

  async findAll(query: CommentQueryDto) {
    const {
      page = 1,
      limit = 20,
      articleId,
      userId,
      status,
      sort = 'commentDate',
      order = 'desc',
    } = query;

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

    const transformedComments = comments.map((comment) => ({
      id: Number(comment.commentID),
      articleId: Number(comment.commentPostID),
      userId: comment.userId,
      nom: comment.commentAuthor,
      email: comment.commentAuthorEmail,
      website: comment.commentAuthorUrl,
      commentaire: comment.commentContent,
      date: comment.commentDate.toISOString(),
      moderation: comment.commentApproved === '1' ? 1 : 0,
      ip: comment.commentAuthorIP,
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      comments: transformedComments,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async findOne(id: number): Promise<any> {
    const comment = await this.prisma.wpComment.findUnique({
      where: { commentID: BigInt(id) },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    return {
      id: Number(comment.commentID),
      articleId: Number(comment.commentPostID),
      userId: comment.userId,
      nom: comment.commentAuthor,
      email: comment.commentAuthorEmail,
      website: comment.commentAuthorUrl,
      commentaire: comment.commentContent,
      date: comment.commentDate.toISOString(),
      moderation: comment.commentApproved === '1' ? 1 : 0,
      ip: comment.commentAuthorIP,
    };
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

    // Check permissions
    if (!isAdmin && existingComment.userId !== userId) {
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

    return {
      id: Number(updatedComment.commentID),
      articleId: Number(updatedComment.commentPostID),
      userId: updatedComment.userId,
      nom: updatedComment.commentAuthor,
      email: updatedComment.commentAuthorEmail,
      website: updatedComment.commentAuthorUrl,
      commentaire: updatedComment.commentContent,
      date: updatedComment.commentDate.toISOString(),
      moderation: updatedComment.commentApproved === '1' ? 1 : 0,
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

    return { message: `Comment ${moderateDto.action}d successfully` };
  }

  async getById(id: number): Promise<any> {
    return this.findOne(id);
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

    // Check permissions
    if (!isAdmin && comment.userId !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    await this.prisma.wpComment.delete({
      where: { commentID: BigInt(id) },
    });

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
}
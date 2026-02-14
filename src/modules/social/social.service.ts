import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';

interface LikeTarget {
    postId?: number;
    activityType?: string;
    activityId?: string;
}

interface CommentTarget extends LikeTarget {
    content: string;
}

@Injectable()
export class SocialService {
    constructor(private prisma: PrismaService) { }

    async createPost(userId: number, content: string) {
        if (!content.trim()) throw new BadRequestException('Content cannot be empty');

        return this.prisma.akSocialPost.create({
            data: {
                userId,
                content,
            },
            include: {
                user: {
                    select: {
                        idMember: true,
                        memberName: true,
                        avatar: true,
                    }
                },
                _count: {
                    select: { likes: true, comments: true }
                }
            }
        });
    }

    async deletePost(userId: number, postId: number) {
        const post = await this.prisma.akSocialPost.findUnique({
            where: { idPost: postId },
            select: { userId: true }
        });

        if (!post) throw new BadRequestException('Post not found');
        if (post.userId !== userId) throw new ForbiddenException('You can only delete your own posts');

        return this.prisma.akSocialPost.delete({
            where: { idPost: postId }
        });
    }

    async toggleLike(userId: number, target: LikeTarget) {
        const { postId, activityType, activityId } = target;

        if (!postId && (!activityType || !activityId)) {
            throw new BadRequestException('Invalid like target');
        }

        const existingLike = await this.prisma.akSocialLike.findUnique({
            where: {
                userId_postId_activityType_activityId: {
                    userId,
                    postId: postId || null,
                    activityType: activityType || null,
                    activityId: activityId || null,
                }
            }
        });

        if (existingLike) {
            await this.prisma.akSocialLike.delete({
                where: { idLike: existingLike.idLike }
            });
            return { liked: false };
        } else {
            await this.prisma.akSocialLike.create({
                data: {
                    userId,
                    postId: postId || null,
                    activityType: activityType || null,
                    activityId: activityId || null,
                }
            });
            return { liked: true };
        }
    }

    async addComment(userId: number, data: CommentTarget) {
        const { content, postId, activityType, activityId } = data;

        if (!content.trim()) throw new BadRequestException('Comment cannot be empty');
        if (!postId && (!activityType || !activityId)) {
            throw new BadRequestException('Invalid comment target');
        }

        return this.prisma.akSocialComment.create({
            data: {
                userId,
                content,
                postId: postId || null,
                activityType: activityType || null,
                activityId: activityId || null,
            },
            include: {
                user: {
                    select: {
                        idMember: true,
                        memberName: true,
                        avatar: true,
                    }
                }
            }
        });
    }

    async getComments(target: LikeTarget) {
        const { postId, activityType, activityId } = target;
        if (!postId && (!activityType || !activityId)) {
            throw new BadRequestException('Invalid target');
        }

        return this.prisma.akSocialComment.findMany({
            where: {
                postId: postId || null,
                activityType: activityType || null,
                activityId: activityId || null,
            },
            include: {
                user: {
                    select: {
                        idMember: true,
                        memberName: true,
                        avatar: true,
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });
    }
}

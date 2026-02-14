import { Controller, Post, Body, Get, UseGuards, Request, Query, Param, Delete } from '@nestjs/common';
import { SocialService } from './social.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('social')
export class SocialController {
    constructor(private readonly socialService: SocialService) { }

    @UseGuards(JwtAuthGuard)
    @Post('posts')
    createPost(@Request() req, @Body() body: { content: string }) {
        return this.socialService.createPost(req.user.userId, body.content);
    }

    @UseGuards(JwtAuthGuard)
    @Delete('posts/:id')
    deletePost(@Request() req, @Param('id') id: string) {
        return this.socialService.deletePost(req.user.userId, +id);
    }

    @UseGuards(JwtAuthGuard)
    @Post('like')
    toggleLike(@Request() req, @Body() body: { postId?: number, activityType?: string, activityId?: string }) {
        return this.socialService.toggleLike(req.user.userId, body);
    }

    @UseGuards(JwtAuthGuard)
    @Post('comment')
    addComment(@Request() req, @Body() body: { content: string, postId?: number, activityType?: string, activityId?: string }) {
        return this.socialService.addComment(req.user.userId, body);
    }

    @UseGuards(JwtAuthGuard)
    @Get('comments')
    getComments(@Query() query: { postId?: string, activityType?: string, activityId?: string }) {
        const postId = query.postId ? +query.postId : undefined;
        return this.socialService.getComments({
            postId,
            activityType: query.activityType,
            activityId: query.activityId
        });
    }
}

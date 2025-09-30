import { Controller, Get, Post, Put, Delete, Query, Param, ParseIntPipe, UseGuards, Request, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ForumsService } from './forums.service';
import { ForumMessageQueryDto } from './dto/forum-message.dto';
import { CreateTopicDto } from './dto/create-topic.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { MoveTopicDto } from './dto/move-topic.dto';
import { LockTopicDto } from './dto/lock-topic.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Forums')
@Controller('forums')
export class ForumsController {
  constructor(private readonly forumsService: ForumsService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Get forum categories with boards' })
  @ApiResponse({ status: 200, description: 'Forum categories retrieved successfully' })
  async getCategories(@Request() req?) {
    const userId = req?.user?.id || null;
    return this.forumsService.getCategories(userId);
  }

  @Get('boards/:boardId')
  @ApiOperation({ summary: 'Get board with topics' })
  @ApiParam({ name: 'boardId', type: 'number', description: 'Board ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Topics per page (default: 20)' })
  @ApiResponse({ status: 200, description: 'Board with topics retrieved successfully' })
  async getBoardWithTopics(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Request() req?
  ) {
    const userId = req?.user?.id || null;
    return this.forumsService.getBoardWithTopics(boardId, parseInt(page), parseInt(limit), userId);
  }

  @Get('topics/:topicId')
  @ApiOperation({ summary: 'Get topic with posts' })
  @ApiParam({ name: 'topicId', type: 'number', description: 'Topic ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Posts per page (default: 15)' })
  @ApiResponse({ status: 200, description: 'Topic with posts retrieved successfully' })
  async getTopicWithPosts(
    @Param('topicId', ParseIntPipe) topicId: number,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '15',
    @Request() req?
  ) {
    const userId = req?.user?.id || null;
    return this.forumsService.getTopicWithPosts(topicId, parseInt(page), parseInt(limit), userId);
  }

  @Post('topics/:topicId/view')
  @ApiOperation({ summary: 'Increment topic view count' })
  @ApiParam({ name: 'topicId', type: 'number', description: 'Topic ID' })
  @ApiResponse({ status: 200, description: 'View count incremented successfully' })
  async incrementTopicViews(@Param('topicId', ParseIntPipe) topicId: number) {
    await this.forumsService.incrementTopicViews(topicId);
    return { success: true };
  }

  @Get('messages/latest')
  @ApiOperation({ summary: 'Get latest forum messages' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of messages to return (default: 10)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of messages to skip (default: 0)' })
  @ApiQuery({ name: 'boardId', required: false, type: Number, description: 'Filter by board ID (optional)' })
  @ApiResponse({ status: 200, description: 'Latest forum messages retrieved successfully' })
  async getLatestMessages(@Query() query: ForumMessageQueryDto) {
    return await this.forumsService.getLatestMessages(query);
  }

  @Get('boards')
  @ApiOperation({ summary: 'Get list of forum boards' })
  @ApiResponse({ status: 200, description: 'Forum boards retrieved successfully' })
  async getBoardList() {
    return await this.forumsService.getBoardList();
  }

  @Get('user/info')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user forum information' })
  @ApiResponse({ status: 200, description: 'User forum information retrieved successfully' })
  async getUserForumInfo(@Request() req) {
    const userId = req.user.id;
    return await this.forumsService.getUserForumInfo(userId);
  }

  @Get('user/recent-activity')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user recent forum activity' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of activities to return (default: 10)' })
  @ApiResponse({ status: 200, description: 'User recent activity retrieved successfully' })
  async getUserRecentActivity(@Request() req, @Query('limit') limit: string = '10') {
    const userId = req.user.id;
    return await this.forumsService.getUserRecentActivity(userId, parseInt(limit));
  }

  @Post('topics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new topic' })
  @ApiResponse({ status: 201, description: 'Topic created successfully' })
  @ApiResponse({ status: 403, description: 'Access denied to this board' })
  async createTopic(@Request() req, @Body() createTopicDto: CreateTopicDto) {
    const userId = req.user.id;
    return await this.forumsService.createTopic(
      createTopicDto.boardId,
      userId,
      createTopicDto.subject,
      createTopicDto.body
    );
  }

  @Post('posts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new post/reply' })
  @ApiResponse({ status: 201, description: 'Post created successfully' })
  @ApiResponse({ status: 403, description: 'Access denied or topic locked' })
  async createPost(@Request() req, @Body() createPostDto: CreatePostDto) {
    const userId = req.user.id;
    return await this.forumsService.createPost(
      createPostDto.topicId,
      userId,
      createPostDto.subject || '',
      createPostDto.body
    );
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get forum statistics' })
  @ApiResponse({ status: 200, description: 'Forum statistics retrieved successfully' })
  async getForumStats() {
    return await this.forumsService.getForumStats();
  }

  @Get('online')
  @ApiOperation({ summary: 'Get online users' })
  @ApiResponse({ status: 200, description: 'Online users retrieved successfully' })
  async getOnlineUsers() {
    return await this.forumsService.getOnlineUsers();
  }

  @Post('activity')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user activity timestamp' })
  @ApiResponse({ status: 200, description: 'Activity updated successfully' })
  async updateUserActivity(@Request() req) {
    const userId = req.user.id;
    await this.forumsService.updateUserActivity(userId);
    return { success: true };
  }

  @Get('birthdays')
  @ApiOperation({ summary: 'Get upcoming birthdays' })
  @ApiResponse({ status: 200, description: 'Upcoming birthdays retrieved successfully' })
  async getUpcomingBirthdays() {
    return await this.forumsService.getUpcomingBirthdays();
  }

  @Put('posts/:messageId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a forum post' })
  @ApiParam({ name: 'messageId', type: 'number', description: 'Message ID' })
  @ApiResponse({ status: 200, description: 'Post updated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied - not your post' })
  async updatePost(
    @Param('messageId', ParseIntPipe) messageId: number,
    @Request() req,
    @Body() updatePostDto: UpdatePostDto
  ) {
    const userId = req.user.id;
    return await this.forumsService.updatePost(
      messageId,
      userId,
      updatePostDto.subject || '',
      updatePostDto.body
    );
  }

  @Delete('posts/:messageId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a forum post' })
  @ApiParam({ name: 'messageId', type: 'number', description: 'Message ID' })
  @ApiResponse({ status: 200, description: 'Post deleted successfully' })
  @ApiResponse({ status: 403, description: 'Access denied - not your post' })
  async deletePost(
    @Param('messageId', ParseIntPipe) messageId: number,
    @Request() req
  ) {
    const userId = req.user.id;
    return await this.forumsService.deletePost(messageId, userId);
  }

  @Put('topics/:topicId/move')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Move a topic to another board (Admin, Global Moderator, Moderator only)' })
  @ApiParam({ name: 'topicId', type: 'number', description: 'Topic ID to move' })
  @ApiResponse({ status: 200, description: 'Topic moved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Topic or target board not found' })
  async moveTopic(
    @Param('topicId', ParseIntPipe) topicId: number,
    @Request() req,
    @Body() moveTopicDto: MoveTopicDto
  ) {
    const userId = req.user.id;
    return await this.forumsService.moveTopic(
      topicId,
      moveTopicDto.targetBoardId,
      userId
    );
  }

  @Put('topics/:topicId/lock')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lock or unlock a topic (Admin, Global Moderator, Moderator only)' })
  @ApiParam({ name: 'topicId', type: 'number', description: 'Topic ID to lock/unlock' })
  @ApiResponse({ status: 200, description: 'Topic lock status updated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  async lockTopic(
    @Param('topicId', ParseIntPipe) topicId: number,
    @Request() req,
    @Body() lockTopicDto: LockTopicDto
  ) {
    const userId = req.user.id;
    return await this.forumsService.lockTopic(
      topicId,
      lockTopicDto.locked,
      userId
    );
  }
}
import { Controller, Get, Post, Put, Delete, Query, Param, ParseIntPipe, UseGuards, Request, Body, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ForumsService } from './forums.service';
import { ForumMessageQueryDto } from './dto/forum-message.dto';
import { CreateTopicDto } from './dto/create-topic.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { MoveTopicDto } from './dto/move-topic.dto';
import { LockTopicDto } from './dto/lock-topic.dto';
import { ReportMessageDto, GetReportsQueryDto } from './dto/report-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { ActivityTrackerService } from '../../shared/services/activity-tracker.service';

@ApiTags('Forums')
@Controller('forums')
export class ForumsController {
  constructor(
    private readonly forumsService: ForumsService,
    private readonly activityTracker: ActivityTrackerService
  ) {}

  @Get('categories')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get forum categories with boards' })
  @ApiResponse({ status: 200, description: 'Forum categories retrieved successfully' })
  async getCategories(@Request() req) {
    const userId = req?.user?.id || null;
    console.log('🔥 CATEGORIES ENDPOINT - req.user:', req?.user);
    console.log('🔥 CATEGORIES ENDPOINT - userId extracted:', userId);
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

  @Get('topics/search')
  @ApiOperation({ summary: 'Search topics by subject (for admin selectors)' })
  @ApiQuery({ name: 'q', required: true, type: String, description: 'Search query' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max results (default: 10)' })
  @ApiResponse({ status: 200, description: 'Topics retrieved successfully' })
  async searchTopics(
    @Query('q') query: string,
    @Query('limit') limit: string = '10'
  ) {
    if (!query || query.trim().length === 0) {
      return [];
    }
    return await this.forumsService.searchTopics(query, parseInt(limit));
  }

  @Get('topics/:topicId/metadata')
  @ApiOperation({ summary: 'Get topic basic metadata (for admin selectors)' })
  @ApiParam({ name: 'topicId', type: 'number', description: 'Topic ID' })
  @ApiResponse({ status: 200, description: 'Topic metadata retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  async getTopicMetadata(@Param('topicId', ParseIntPipe) topicId: number) {
    return this.forumsService.getTopicMetadata(topicId);
  }

  @Get('topics/:topicId')
  @UseGuards(OptionalJwtAuthGuard)
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

  @Get('topics/:topicId/preview')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get topic preview for media pages' })
  @ApiParam({ name: 'topicId', type: 'number', description: 'Topic ID' })
  @ApiResponse({ status: 200, description: 'Topic preview retrieved successfully' })
  async getTopicPreview(
    @Param('topicId', ParseIntPipe) topicId: number,
    @Request() req?
  ) {
    const userId = req?.user?.id || null;
    return this.forumsService.getTopicPreview(topicId, userId);
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

  @Get('messages/:messageId/page')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get the page number where a specific message appears in its topic' })
  @ApiParam({ name: 'messageId', type: 'number', description: 'Message ID' })
  @ApiResponse({ status: 200, description: 'Page number retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async getMessagePage(
    @Param('messageId', ParseIntPipe) messageId: number,
    @Request() req?
  ) {
    const userId = req?.user?.id || null;
    return await this.forumsService.getMessagePage(messageId, userId);
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
      createTopicDto.body,
      createTopicDto.poll
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

  @Post('activity')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user activity timestamp' })
  @ApiResponse({ status: 200, description: 'Activity updated successfully' })
  async updateUserActivity(@Request() req, @Body() body?: { action?: string; topicId?: number; boardId?: number; [key: string]: any }) {
    const userId = req.user.id;
    await this.forumsService.updateUserActivity(userId, body);
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

  @Post('maintenance/fix-pointers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fix data integrity issues for topic/board message pointers (Admin only)' })
  @ApiResponse({ status: 200, description: 'Message pointers fixed successfully' })
  @ApiResponse({ status: 403, description: 'Access denied - admin only' })
  async fixMessagePointers(@Request() req) {
    const userId = req.user.id;
    // Check if user is admin (group 1)
    const userGroups = await this.forumsService['getUserGroups'](userId);
    const isAdmin = userGroups.includes(1);

    if (!isAdmin) {
      throw new Error('Access denied - admin only');
    }

    return await this.forumsService.fixMessagePointers();
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

  @Post('posts/:messageId/report')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Report a message to moderators' })
  @ApiParam({ name: 'messageId', type: 'number', description: 'Message ID to report' })
  @ApiResponse({ status: 201, description: 'Message reported successfully' })
  @ApiResponse({ status: 403, description: 'Access denied or already reported' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async reportMessage(
    @Param('messageId', ParseIntPipe) messageId: number,
    @Request() req,
    @Body() reportMessageDto: ReportMessageDto
  ) {
    const userId = req.user.id;
    return await this.forumsService.reportMessage(
      messageId,
      userId,
      reportMessageDto.comment
    );
  }

  @Get('reports/count')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get count of pending message reports (Admin, Global Moderator, Moderator only)' })
  @ApiResponse({ status: 200, description: 'Count retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied - insufficient permissions' })
  async getReportsCount(@Request() req) {
    const userId = req.user.id;
    return await this.forumsService.getReportsCount(userId);
  }

  @Get('reports')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all message reports (Admin, Global Moderator, Moderator only)' })
  @ApiQuery({ name: 'status', required: false, type: Number, description: 'Filter by status: 0 = open, 1 = closed' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of reports to return (default: 20)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of reports to skip (default: 0)' })
  @ApiResponse({ status: 200, description: 'Reports retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied - insufficient permissions' })
  async getReports(
    @Request() req,
    @Query() query: GetReportsQueryDto
  ) {
    const userId = req.user.id;
    return await this.forumsService.getReports(
      userId,
      query.status,
      query.limit || 20,
      query.offset || 0
    );
  }

  @Get('reports/:reportId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a specific report by ID (Admin, Global Moderator, Moderator only)' })
  @ApiParam({ name: 'reportId', type: 'number', description: 'Report ID' })
  @ApiResponse({ status: 200, description: 'Report retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async getReportById(
    @Param('reportId', ParseIntPipe) reportId: number,
    @Request() req
  ) {
    const userId = req.user.id;
    return await this.forumsService.getReportById(reportId, userId);
  }

  @Put('reports/:reportId/close')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Close a report (Admin, Global Moderator, Moderator only)' })
  @ApiParam({ name: 'reportId', type: 'number', description: 'Report ID to close' })
  @ApiResponse({ status: 200, description: 'Report closed successfully' })
  @ApiResponse({ status: 403, description: 'Access denied - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async closeReportPut(
    @Param('reportId', ParseIntPipe) reportId: number,
    @Request() req
  ) {
    const userId = req.user.id;
    return await this.forumsService.closeReport(reportId, userId);
  }

  @Post('reports/:reportId/close')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Close a report (Admin, Global Moderator, Moderator only)' })
  @ApiParam({ name: 'reportId', type: 'number', description: 'Report ID to close' })
  @ApiResponse({ status: 200, description: 'Report closed successfully' })
  @ApiResponse({ status: 403, description: 'Access denied - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async closeReport(
    @Param('reportId', ParseIntPipe) reportId: number,
    @Request() req
  ) {
    const userId = req.user.id;
    return await this.forumsService.closeReport(reportId, userId);
  }

  @Post('polls/:pollId/vote')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vote on a poll' })
  @ApiParam({ name: 'pollId', type: 'number', description: 'Poll ID' })
  @ApiResponse({ status: 200, description: 'Vote recorded successfully' })
  @ApiResponse({ status: 403, description: 'Cannot vote - poll locked, expired, or already voted' })
  @ApiResponse({ status: 404, description: 'Poll not found' })
  async votePoll(
    @Param('pollId', ParseIntPipe) pollId: number,
    @Request() req,
    @Body() voteDto: any
  ) {
    const userId = req.user.id;
    return await this.forumsService.votePoll(pollId, userId, voteDto.choices);
  }

  @Get('polls/:pollId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get poll data' })
  @ApiParam({ name: 'pollId', type: 'number', description: 'Poll ID' })
  @ApiResponse({ status: 200, description: 'Poll data retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Poll not found' })
  async getPoll(
    @Param('pollId', ParseIntPipe) pollId: number,
    @Request() req
  ) {
    const userId = req?.user?.id || null;
    return await this.forumsService.getPollData(pollId, userId);
  }

  @Get('polls/:pollId/voters')
  @ApiOperation({ summary: 'Get list of users who voted on a poll' })
  @ApiParam({ name: 'pollId', type: 'number', description: 'Poll ID' })
  @ApiResponse({ status: 200, description: 'Poll voters retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Poll not found' })
  async getPollVoters(
    @Param('pollId', ParseIntPipe) pollId: number
  ) {
    return await this.forumsService.getPollVoters(pollId);
  }

  @Get('unread')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get unread topics for current user' })
  @ApiQuery({ name: 'boardId', required: false, type: Number, description: 'Filter by board ID (optional)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Topics per page (default: 20)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number to skip (default: 0)' })
  @ApiResponse({ status: 200, description: 'Unread topics retrieved successfully' })
  async getUnreadTopics(
    @Request() req,
    @Query('boardId') boardId?: string,
    @Query('limit') limit: string = '20',
    @Query('offset') offset: string = '0'
  ) {
    const userId = req.user.id;
    return await this.forumsService.getUnreadTopics(
      userId,
      boardId ? parseInt(boardId) : undefined,
      parseInt(limit),
      parseInt(offset)
    );
  }

  @Get('unread/count')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get count of unread topics for current user' })
  @ApiResponse({ status: 200, description: 'Unread count retrieved successfully' })
  async getUnreadCount(@Request() req) {
    const userId = req.user.id;
    return await this.forumsService.getUnreadCount(userId);
  }

  @Post('topics/:topicId/mark-read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark topic as read' })
  @ApiParam({ name: 'topicId', type: 'number', description: 'Topic ID' })
  @ApiResponse({ status: 200, description: 'Topic marked as read successfully' })
  async markTopicAsRead(
    @Param('topicId', ParseIntPipe) topicId: number,
    @Request() req
  ) {
    const userId = req.user.id;
    return await this.forumsService.markTopicAsRead(topicId, userId);
  }

  @Post('mark-all-read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark all topics as read for current user' })
  @ApiResponse({ status: 200, description: 'All topics marked as read successfully' })
  async markAllAsRead(@Request() req) {
    const userId = req.user.id;
    return await this.forumsService.markAllAsRead(userId);
  }

  @Get('online')
  @ApiOperation({ summary: 'Get list of online users and guests with their activities' })
  @ApiQuery({ name: 'filter', required: false, enum: ['all', 'members', 'guests'], description: 'Filter by user type' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of users to return (default: 50)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of users to skip (default: 0)' })
  @ApiResponse({ status: 200, description: 'Online users retrieved successfully' })
  async getOnlineUsers(
    @Query('filter') filter?: 'all' | 'members' | 'guests',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    return await this.activityTracker.getOnlineUsers({
      filter: filter || 'all',
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0
    });
  }

  @Get('online/stats')
  @ApiOperation({ summary: 'Get online users statistics' })
  @ApiResponse({ status: 200, description: 'Online stats retrieved successfully' })
  async getOnlineStats() {
    return await this.activityTracker.getOnlineStats();
  }

  @Get('users/:userId/posts')
  @ApiOperation({ summary: 'Get all forum posts from a specific user' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Posts per page (default: 20)' })
  @ApiResponse({ status: 200, description: 'User posts retrieved successfully' })
  async getUserPosts(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20'
  ) {
    return await this.forumsService.getUserPosts(userId, parseInt(page), parseInt(limit));
  }

  @Get('search')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Search forum posts and topics by title or content' })
  @ApiQuery({ name: 'q', required: true, type: String, description: 'Search query' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Results per page (default: 20)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of results to skip (default: 0)' })
  @ApiResponse({ status: 200, description: 'Search results retrieved successfully' })
  async searchForums(
    @Query('q') searchQuery: string,
    @Query('limit') limit: string = '20',
    @Query('offset') offset: string = '0',
    @Request() req?
  ) {
    if (!searchQuery || searchQuery.trim().length === 0) {
      return { results: [], total: 0 };
    }
    const userId = req?.user?.id || null;
    return await this.forumsService.searchForums(
      searchQuery,
      parseInt(limit),
      parseInt(offset),
      userId
    );
  }
}
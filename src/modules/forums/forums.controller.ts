import { Controller, Get, Post, Query, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ForumsService } from './forums.service';
import { ForumMessageQueryDto } from './dto/forum-message.dto';

@ApiTags('Forums')
@Controller('forums')
export class ForumsController {
  constructor(private readonly forumsService: ForumsService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Get forum categories with boards' })
  @ApiResponse({ status: 200, description: 'Forum categories retrieved successfully' })
  async getCategories() {
    return this.forumsService.getCategories();
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
    @Query('limit') limit: string = '20'
  ) {
    return this.forumsService.getBoardWithTopics(boardId, parseInt(page), parseInt(limit));
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
    @Query('limit') limit: string = '15'
  ) {
    return this.forumsService.getTopicWithPosts(topicId, parseInt(page), parseInt(limit));
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
}
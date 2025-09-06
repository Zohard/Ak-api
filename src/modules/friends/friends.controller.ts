import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
  BadRequestException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FriendsService } from './friends.service';

@ApiTags('Friends')
@Controller('friends')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get()
  @ApiOperation({ 
    summary: 'Get user\'s friends list',
    description: 'Retrieve the current user\'s friends list with statistics'
  })
  @ApiResponse({
    status: 200,
    description: 'Friends list retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        friends: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number', example: 123 },
              realName: { type: 'string', example: 'John Doe' },
              lastLogin: { type: 'number', example: 1640995200 },
              avatar: { type: 'string', example: '../img/avatar123.jpg' },
              isMutual: { type: 'boolean', example: true },
              lastLoginFormatted: { type: 'string', example: '2 jours' }
            }
          }
        },
        stats: {
          type: 'object',
          properties: {
            totalFriends: { type: 'number', example: 15 },
            mutualFriends: { type: 'number', example: 12 },
            recentlyActive: { type: 'number', example: 8 }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getFriends(@Request() req: any) {
    return await this.friendsService.getFriends(req.user.id);
  }

  @Get('user/:userId')
  @ApiOperation({ 
    summary: 'Get specific user\'s friends list',
    description: 'Retrieve a specific user\'s friends list (public view)'
  })
  @ApiParam({ name: 'userId', type: 'number', description: 'Target user ID' })
  @ApiResponse({
    status: 200,
    description: 'Friends list retrieved successfully'
  })
  @ApiResponse({ status: 400, description: 'Invalid user ID' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserFriends(@Param('userId') userId: string) {
    const parsedUserId = parseInt(userId);
    if (isNaN(parsedUserId)) {
      throw new BadRequestException('Invalid user ID');
    }
    return await this.friendsService.getFriends(parsedUserId);
  }

  @Post('add/:targetUserId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Add a friend',
    description: 'Add another user to the current user\'s friends list'
  })
  @ApiParam({ name: 'targetUserId', type: 'number', description: 'ID of user to add as friend' })
  @ApiResponse({
    status: 200,
    description: 'Friend added successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Friend added successfully' },
        isMutual: { type: 'boolean', example: true }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid request or already friends' })
  @ApiResponse({ status: 404, description: 'Target user not found' })
  async addFriend(
    @Request() req: any,
    @Param('targetUserId') targetUserId: string
  ) {
    const parsedTargetUserId = parseInt(targetUserId);
    if (isNaN(parsedTargetUserId)) {
      throw new BadRequestException('Invalid target user ID');
    }
    return await this.friendsService.addFriend(req.user.id, parsedTargetUserId);
  }

  @Delete('remove/:targetUserId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Remove a friend',
    description: 'Remove a user from the current user\'s friends list'
  })
  @ApiParam({ name: 'targetUserId', type: 'number', description: 'ID of user to remove from friends' })
  @ApiResponse({
    status: 200,
    description: 'Friend removed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Friend removed successfully' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid request or not friends' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async removeFriend(
    @Request() req: any,
    @Param('targetUserId') targetUserId: string
  ) {
    const parsedTargetUserId = parseInt(targetUserId);
    if (isNaN(parsedTargetUserId)) {
      throw new BadRequestException('Invalid target user ID');
    }
    return await this.friendsService.removeFriend(req.user.id, parsedTargetUserId);
  }

  @Get('status/:targetUserId')
  @ApiOperation({ 
    summary: 'Check friendship status',
    description: 'Check the friendship status between current user and target user'
  })
  @ApiParam({ name: 'targetUserId', type: 'number', description: 'Target user ID' })
  @ApiResponse({
    status: 200,
    description: 'Friendship status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        areFriends: { type: 'boolean', example: true },
        isMutual: { type: 'boolean', example: true },
        targetHasUser: { type: 'boolean', example: true }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid user ID' })
  async getFriendshipStatus(
    @Request() req: any,
    @Param('targetUserId') targetUserId: string
  ) {
    const parsedTargetUserId = parseInt(targetUserId);
    if (isNaN(parsedTargetUserId)) {
      throw new BadRequestException('Invalid target user ID');
    }
    return await this.friendsService.getFriendshipStatus(req.user.id, parsedTargetUserId);
  }

  @Get('mutual/:targetUserId')
  @ApiOperation({ 
    summary: 'Get mutual friends',
    description: 'Get friends in common between current user and target user'
  })
  @ApiParam({ name: 'targetUserId', type: 'number', description: 'Target user ID' })
  @ApiResponse({
    status: 200,
    description: 'Mutual friends retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number', example: 456 },
          realName: { type: 'string', example: 'Jane Smith' },
          lastLogin: { type: 'number', example: 1640995200 },
          avatar: { type: 'string', example: '../img/avatar456.jpg' },
          lastLoginFormatted: { type: 'string', example: '1 jour' }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid user ID' })
  async getMutualFriends(
    @Request() req: any,
    @Param('targetUserId') targetUserId: string
  ) {
    const parsedTargetUserId = parseInt(targetUserId);
    if (isNaN(parsedTargetUserId)) {
      throw new BadRequestException('Invalid target user ID');
    }
    return await this.friendsService.getMutualFriends(req.user.id, parsedTargetUserId);
  }

  @Get('search')
  @ApiOperation({ 
    summary: 'Search for users',
    description: 'Search for potential friends by name'
  })
  @ApiQuery({ name: 'q', type: 'string', description: 'Search query (minimum 2 characters)' })
  @ApiQuery({ name: 'limit', type: 'number', required: false, description: 'Results limit (default: 10)' })
  @ApiResponse({
    status: 200,
    description: 'Search results retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number', example: 789 },
          realName: { type: 'string', example: 'Bob Johnson' },
          avatar: { type: 'string', example: '../img/avatar789.jpg' },
          areFriends: { type: 'boolean', example: false },
          isMutual: { type: 'boolean', example: false }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid search query' })
  async searchUsers(
    @Request() req: any,
    @Query('q') query: string,
    @Query('limit') limit?: string
  ) {
    const parsedLimit = limit ? parseInt(limit) : 10;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      throw new BadRequestException('Invalid limit (must be between 1 and 50)');
    }
    return await this.friendsService.searchUsers(query, req.user.userId, parsedLimit);
  }

  @Get('recommendations')
  @ApiOperation({ 
    summary: 'Get friend recommendations',
    description: 'Get friend recommendations based on mutual friends'
  })
  @ApiQuery({ name: 'limit', type: 'number', required: false, description: 'Results limit (default: 5)' })
  @ApiResponse({
    status: 200,
    description: 'Friend recommendations retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number', example: 999 },
          realName: { type: 'string', example: 'Alice Cooper' },
          avatar: { type: 'string', example: '../img/avatar999.jpg' },
          mutualFriendsCount: { type: 'number', example: 3 },
          mutualFriends: {
            type: 'array',
            items: { type: 'string' },
            example: ['John Doe', 'Jane Smith', 'Bob Johnson']
          }
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getFriendRecommendations(
    @Request() req: any,
    @Query('limit') limit?: string
  ) {
    const parsedLimit = limit ? parseInt(limit) : 5;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 20) {
      throw new BadRequestException('Invalid limit (must be between 1 and 20)');
    }
    return await this.friendsService.getFriendRecommendations(req.user.userId, parsedLimit);
  }

  @Post('bulk-add')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Add multiple friends',
    description: 'Add multiple users to friends list in one request'
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk friend addition completed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        added: { type: 'number', example: 3 },
        failed: { type: 'number', example: 1 },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              userId: { type: 'number', example: 123 },
              success: { type: 'boolean', example: true },
              message: { type: 'string', example: 'Friend added successfully' }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async bulkAddFriends(
    @Request() req: any,
    @Body() body: { userIds: number[] }
  ) {
    if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
      throw new BadRequestException('userIds array is required and must not be empty');
    }

    if (body.userIds.length > 10) {
      throw new BadRequestException('Cannot add more than 10 friends at once');
    }

    const results: { userId: number; success: boolean; message: string }[] = [];
    let added = 0;
    let failed = 0;

    for (const targetUserId of body.userIds) {
      try {
        const result = await this.friendsService.addFriend(req.user.id, targetUserId);
        results.push({
          userId: targetUserId,
          success: true,
          message: result.message
        });
        added++;
      } catch (error) {
        results.push({
          userId: targetUserId,
          success: false,
          message: String((error as any)?.message || 'Unknown error')
        });
        failed++;
      }
    }

    return {
      success: true,
      added,
      failed,
      results
    };
  }

  @Delete('bulk-remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Remove multiple friends',
    description: 'Remove multiple users from friends list in one request'
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk friend removal completed'
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async bulkRemoveFriends(
    @Request() req: any,
    @Body() body: { userIds: number[] }
  ) {
    if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
      throw new BadRequestException('userIds array is required and must not be empty');
    }

    if (body.userIds.length > 10) {
      throw new BadRequestException('Cannot remove more than 10 friends at once');
    }

    const results: { userId: number; success: boolean; message: string }[] = [];
    let removed = 0;
    let failed = 0;

    for (const targetUserId of body.userIds) {
      try {
        const result = await this.friendsService.removeFriend(req.user.id, targetUserId);
        results.push({
          userId: targetUserId,
          success: true,
          message: result.message
        });
        removed++;
      } catch (error) {
        results.push({
          userId: targetUserId,
          success: false,
          message: String((error as any)?.message || 'Unknown error')
        });
        failed++;
      }
    }

    return {
      success: true,
      removed,
      failed,
      results
    };
  }
}

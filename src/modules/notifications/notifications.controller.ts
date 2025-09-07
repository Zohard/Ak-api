import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  NotificationsService,
  NotificationData,
} from './notifications.service';
import {
  UpdatePreferencesDto,
  SendNotificationDto,
} from './dto/notifications.dto';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get user notifications' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({
    name: 'unreadOnly',
    required: false,
    description: 'Show only unread notifications',
  })
  @ApiResponse({ status: 200, description: 'User notifications retrieved' })
  async getUserNotifications(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const showUnreadOnly = unreadOnly === 'true';

    return this.notificationsService.getUserNotifications(
      user.id,
      parsedPage,
      parsedLimit,
      showUnreadOnly,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get notification statistics' })
  @ApiResponse({ status: 200, description: 'Notification statistics' })
  async getNotificationStats(@CurrentUser() user: any) {
    return this.notificationsService.getNotificationStats(user.id);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get user notification preferences' })
  @ApiResponse({ status: 200, description: 'User notification preferences' })
  async getUserPreferences(@CurrentUser() user: any) {
    return this.notificationsService.getUserPreferences(user.id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update user notification preferences' })
  @ApiBody({ type: UpdatePreferencesDto })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully' })
  async updateUserPreferences(
    @CurrentUser() user: any,
    @Body() preferences: UpdatePreferencesDto,
  ) {
    const success = await this.notificationsService.updateUserPreferences(
      user.id,
      preferences,
    );

    return {
      success,
      message: success
        ? 'Preferences updated successfully'
        : 'Failed to update preferences',
    };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markAsRead(
    @Param('id', ParseIntPipe) notificationId: number,
    @CurrentUser() user: any,
  ) {
    const success = await this.notificationsService.markAsRead(
      notificationId,
      user.id,
    );

    return {
      success,
      message: success
        ? 'Notification marked as read'
        : 'Failed to mark as read',
    };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllAsRead(@CurrentUser() user: any) {
    const success = await this.notificationsService.markAllAsRead(user.id);

    return {
      success,
      message: success
        ? 'All notifications marked as read'
        : 'Failed to mark all as read',
    };
  }

  // Admin endpoints
  @Post('send')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Send notification to user (Admin only)' })
  @ApiBody({ type: SendNotificationDto })
  @ApiResponse({ status: 201, description: 'Notification sent successfully' })
  async sendNotification(@Body() notificationData: SendNotificationDto) {
    // Ensure priority is set
    const notification: NotificationData = {
      ...notificationData,
      priority: notificationData.priority || 'medium',
    };
    const success =
      await this.notificationsService.sendNotification(notification);

    return {
      success,
      message: success
        ? 'Notification sent successfully'
        : 'Failed to send notification',
    };
  }

  @Post('broadcast')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Broadcast notification to all users (Admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['new_anime', 'new_manga', 'marketing', 'friend_request', 'friend_accepted'] },
        title: { type: 'string' },
        message: { type: 'string' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          default: 'medium',
        },
        data: { type: 'object' },
      },
      required: ['type', 'title', 'message'],
    },
  })
  @ApiResponse({ status: 201, description: 'Broadcast notification sent' })
  async broadcastNotification(
    @Body()
    broadcastData: {
      type: 'new_anime' | 'new_manga' | 'marketing' | 'friend_request' | 'friend_accepted';
      title: string;
      message: string;
      priority?: 'low' | 'medium' | 'high';
      data?: any;
    },
  ) {
    // Get all active users
    const users = await this.notificationsService['prisma'].$queryRaw`
      SELECT id_member FROM smf_members WHERE is_activated = 1
    `;

    const results: { userId: number; success: boolean }[] = [];
    for (const user of users as any[]) {
      const notificationData: NotificationData = {
        userId: user.id_member,
        type: broadcastData.type,
        title: broadcastData.title,
        message: broadcastData.message,
        priority: broadcastData.priority || 'medium',
        data: broadcastData.data,
      };

      const success =
        await this.notificationsService.sendNotification(notificationData);
      results.push({ userId: user.id_member, success });
    }

    const successCount = results.filter((r) => r.success).length;

    return {
      message: `Broadcast completed`,
      totalUsers: results.length,
      successCount,
      failureCount: results.length - successCount,
    };
  }
}

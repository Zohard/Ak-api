import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AdminUsersService } from './admin-users.service';
import { UserAdminQueryDto } from './dto/user-admin-query.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import { AuditLogInterceptor } from '../../../common/interceptors/audit-log.interceptor';
import {
  AuditLog,
  AuditActions,
  AuditTargets,
} from '../../../common/decorators/audit-log.decorator';

@ApiTags('Admin - Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all users with admin management options' })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully with pagination',
    schema: {
      type: 'object',
      properties: {
        users: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id_member: { type: 'number' },
              member_name: { type: 'string' },
              real_name: { type: 'string' },
              email_address: { type: 'string' },
              date_registered: { type: 'number' },
              last_login: { type: 'number' },
              posts: { type: 'number' },
              is_activated: { type: 'number' },
              id_group: { type: 'number' },
              group_name: { type: 'string' },
              online_color: { type: 'string' },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            currentPage: { type: 'number' },
            totalPages: { type: 'number' },
            totalItems: { type: 'number' },
            hasNext: { type: 'boolean' },
            hasPrevious: { type: 'boolean' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async findAll(@Query() query: UserAdminQueryDto) {
    return this.adminUsersService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get user statistics for admin dashboard' })
  @ApiResponse({
    status: 200,
    description: 'User statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        total_users: { type: 'number' },
        active_users: { type: 'number' },
        banned_users: { type: 'number' },
        admin_users: { type: 'number' },
        moderator_users: { type: 'number' },
        new_users_month: { type: 'number' },
      },
    },
  })
  async getUserStats() {
    return this.adminUsersService.getUserStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user details for admin management' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User details retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            id_member: { type: 'number' },
            member_name: { type: 'string' },
            real_name: { type: 'string' },
            email_address: { type: 'string' },
            date_registered: { type: 'number' },
            last_login: { type: 'number' },
            posts: { type: 'number' },
            is_activated: { type: 'number' },
            id_group: { type: 'number' },
            group_name: { type: 'string' },
            review_count: { type: 'number' },
            avg_rating_given: { type: 'number' },
          },
        },
        recent_activity: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              date: { type: 'number' },
              title: { type: 'string' },
              content_type: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.adminUsersService.findOne(id);
  }

  @Put(':id')
  @AuditLog(AuditActions.USER_UPDATE, AuditTargets.USER)
  @ApiOperation({ summary: 'Update user details (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserAdminDto,
    @Request() req: any,
  ) {
    return this.adminUsersService.update(id, updateUserDto, req.user.id);
  }

  @Post(':id/ban')
  @AuditLog(AuditActions.USER_BAN, AuditTargets.USER)
  @ApiOperation({ summary: 'Ban a user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User banned successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @HttpCode(HttpStatus.OK)
  async banUser(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    return this.adminUsersService.banUser(id, reason, req.user.id);
  }

  @Post(':id/unban')
  @AuditLog(AuditActions.USER_UNBAN, AuditTargets.USER)
  @ApiOperation({ summary: 'Unban a user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User unbanned successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @HttpCode(HttpStatus.OK)
  async unbanUser(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.adminUsersService.unbanUser(id, req.user.id);
  }

  @Delete(':id')
  @AuditLog(AuditActions.USER_DELETE, AuditTargets.USER)
  @ApiOperation({ summary: 'Delete a user (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete administrator users',
  })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.adminUsersService.deleteUser(id, req.user.id);
  }
}

import {
  Controller,
  Get,
  Post,
  UseGuards,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('RBAC - Permissions')
@Controller('admin/permissions')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all permissions' })
  @ApiResponse({ status: 200, description: 'List of all active permissions' })
  findAll() {
    return this.permissionsService.findAll();
  }

  @Get('grouped')
  @ApiOperation({ summary: 'Get permissions grouped by resource' })
  @ApiResponse({ status: 200, description: 'Permissions grouped by resource for UI display' })
  getGrouped() {
    return this.permissionsService.getGroupedPermissions();
  }

  @Get('matrix')
  @ApiOperation({ summary: 'Get permission matrix (resources × actions)' })
  @ApiResponse({ status: 200, description: 'Permission matrix for table display' })
  getMatrix() {
    return this.permissionsService.getPermissionMatrix();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get permission statistics' })
  @ApiResponse({ status: 200, description: 'Permission statistics' })
  getStats() {
    return this.permissionsService.getStats();
  }

  @Post('seed')
  @ApiOperation({ summary: 'Seed default permissions' })
  @ApiResponse({ status: 201, description: 'Default permissions seeded successfully' })
  seed() {
    return this.permissionsService.seedDefaultPermissions();
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get all permissions for a user (combined from all roles)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User permissions retrieved successfully' })
  getUserPermissions(@Param('userId', ParseIntPipe) userId: number) {
    return this.permissionsService.getUserPermissions(userId);
  }

  @Get('check/:userId')
  @ApiOperation({ summary: 'Check if user has a specific permission' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiQuery({ name: 'resource', description: 'Resource name (e.g., ARTICLES)' })
  @ApiQuery({ name: 'action', description: 'Action name (e.g., CREATE)' })
  @ApiResponse({ status: 200, description: 'Permission check result' })
  async checkUserPermission(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('resource') resource: string,
    @Query('action') action: string,
  ) {
    const hasPermission = await this.permissionsService.userHasPermission(
      userId,
      resource,
      action,
    );

    return {
      userId,
      resource,
      action,
      hasPermission,
    };
  }
}

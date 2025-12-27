import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { RoleQueryDto } from './dto/role-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('RBAC - Roles')
@Controller('admin/roles')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new role' })
  @ApiResponse({ status: 201, description: 'Role created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - role name already exists' })
  create(@Body() createRoleDto: CreateRoleDto, @Request() req) {
    return this.rolesService.create(createRoleDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all roles' })
  @ApiResponse({ status: 200, description: 'List of all roles' })
  findAll(@Query() query: RoleQueryDto) {
    return this.rolesService.findAll(query.includeInactive);
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Get role/permission audit logs' })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved successfully' })
  getAuditLogs(
    @Query('limit', ParseIntPipe) limit = 100,
    @Query('offset', ParseIntPipe) offset = 0,
  ) {
    return this.rolesService.getAuditLogs(limit, offset);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get role by ID with full details' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({ status: 200, description: 'Role details' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({ status: 200, description: 'Role updated successfully' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({ status: 400, description: 'Cannot modify system role' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoleDto: UpdateRoleDto,
    @Request() req,
  ) {
    return this.rolesService.update(id, updateRoleDto, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({ status: 200, description: 'Role deleted successfully' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({ status: 400, description: 'Cannot delete system role or role in use' })
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.rolesService.remove(id, req.user.id);
  }

  @Post(':id/permissions')
  @ApiOperation({ summary: 'Assign permissions to role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({ status: 200, description: 'Permissions assigned successfully' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({ status: 400, description: 'Invalid permission IDs' })
  assignPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignPermissionsDto,
    @Request() req,
  ) {
    return this.rolesService.assignPermissions(id, dto, req.user.id);
  }

  @Get(':id/permissions')
  @ApiOperation({ summary: 'Get role permissions' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({ status: 200, description: 'Role permissions' })
  getRolePermissions(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.getRolePermissions(id);
  }

  @Get(':id/users')
  @ApiOperation({ summary: 'Get all users with this role' })
  @ApiParam({ name: 'id', description: 'Role ID' })
  @ApiResponse({ status: 200, description: 'List of users with this role' })
  getRoleUsers(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.getRoleUsers(id);
  }

  @Post('assign-user')
  @ApiOperation({ summary: 'Assign a role to a user' })
  @ApiResponse({ status: 201, description: 'Role assigned to user successfully' })
  @ApiResponse({ status: 404, description: 'User or role not found' })
  assignRoleToUser(@Body() dto: AssignRoleDto, @Request() req) {
    return this.rolesService.assignRoleToUser(dto, req.user.id);
  }

  @Delete('user/:userId/role/:roleId')
  @ApiOperation({ summary: 'Remove a role from a user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiParam({ name: 'roleId', description: 'Role ID' })
  @ApiResponse({ status: 200, description: 'Role removed from user successfully' })
  @ApiResponse({ status: 404, description: 'User role assignment not found' })
  removeRoleFromUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
    @Request() req,
  ) {
    return this.rolesService.removeRoleFromUser(userId, roleId, req.user.id);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get all roles assigned to a user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User roles retrieved successfully' })
  getUserRoles(@Param('userId', ParseIntPipe) userId: number) {
    return this.rolesService.getUserRoles(userId);
  }
}

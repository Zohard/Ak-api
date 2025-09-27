import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Delete,
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
import { AdminStaffAkService } from './admin-staff-ak.service';
import { AddStaffAkDto } from './dto/add-staff-ak.dto';
import { StaffAkQueryDto } from './dto/staff-ak-query.dto';
import {
  AuditLog,
  AuditActions,
  AuditTargets,
} from '../../../common/decorators/audit-log.decorator';

@ApiTags('Admin - Staff AK')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/staff-ak')
export class AdminStaffAkController {
  constructor(private readonly adminStaffAkService: AdminStaffAkService) {}

  @Get()
  @ApiOperation({ summary: 'Get all staff AK members from wp_users table' })
  @ApiResponse({
    status: 200,
    description: 'Staff AK members retrieved successfully with pagination',
  })
  async findAllStaffAk(@Query() query: StaffAkQueryDto) {
    return this.adminStaffAkService.findAllStaffAk(query);
  }

  @Get('smf-members')
  @ApiOperation({ summary: 'Get SMF members available to add as staff AK with their current group information' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name or email' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiResponse({
    status: 200,
    description: 'SMF members retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        members: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id_member: { type: 'number' },
              member_name: { type: 'string' },
              real_name: { type: 'string' },
              email_address: { type: 'string' },
              date_registered: { type: 'number' },
              posts: { type: 'number' },
              is_writer: { type: 'boolean' },
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
  async getSmfMembers(@Query() query: any) {
    return this.adminStaffAkService.getSmfMembers(query);
  }

  @Get('smf-membergroups')
  @ApiOperation({ summary: 'Get SMF membergroups for dropdown selection' })
  @ApiResponse({
    status: 200,
    description: 'SMF membergroups retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id_group: { type: 'number' },
          group_name: { type: 'string' },
          online_color: { type: 'string' },
          max_messages: { type: 'number' },
          min_posts: { type: 'number' },
        },
      },
    },
  })
  async getSmfMembergroups() {
    return this.adminStaffAkService.getSmfMembergroups();
  }

  @Post('update-member-group/:memberId/:groupId')
  @AuditLog(AuditActions.USER_UPDATE, AuditTargets.USER)
  @ApiOperation({ summary: 'Update an SMF member\'s group' })
  @ApiParam({ name: 'memberId', description: 'SMF Member ID' })
  @ApiParam({ name: 'groupId', description: 'New Group ID' })
  @ApiResponse({
    status: 200,
    description: 'Member group updated successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        member: {
          type: 'object',
          properties: {
            id_member: { type: 'number' },
            member_name: { type: 'string' },
            previous_id_group: { type: 'number' },
            new_id_group: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'SMF member not found' })
  @HttpCode(HttpStatus.OK)
  async updateMemberGroup(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Request() req: any,
  ) {
    return this.adminStaffAkService.updateSmfMemberGroup(
      memberId,
      groupId,
      req.user.id,
    );
  }

  @Post('add-from-smf/:id')
  @AuditLog(AuditActions.USER_CREATE, AuditTargets.USER)
  @ApiOperation({ summary: 'Add an SMF member to wp_users as staff AK and optionally change their SMF group' })
  @ApiParam({ name: 'id', description: 'SMF Member ID' })
  @ApiResponse({
    status: 201,
    description: 'Staff AK member added successfully and SMF group updated if provided',
    schema: {
      type: 'object',
      properties: {
        writer: {
          type: 'object',
          properties: {
            ID: { type: 'string' },
            user_login: { type: 'string' },
            user_nicename: { type: 'string' },
            user_email: { type: 'string' },
            display_name: { type: 'string' },
          },
        },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'SMF member not found' })
  @ApiResponse({ status: 409, description: 'User already exists as writer' })
  @HttpCode(HttpStatus.CREATED)
  async addWriterFromSmf(
    @Param('id', ParseIntPipe) id: number,
    @Body() addStaffAkDto: AddStaffAkDto,
    @Request() req: any,
  ) {
    return this.adminStaffAkService.addSmfMemberAsStaffAk(
      id,
      addStaffAkDto,
      req.user.id,
    );
  }

  @Post('bulk-add')
  @AuditLog(AuditActions.USER_CREATE, AuditTargets.USER)
  @ApiOperation({ summary: 'Bulk add multiple SMF members as staff AK' })
  @ApiResponse({
    status: 201,
    description: 'Bulk staff AK addition completed',
    schema: {
      type: 'object',
      properties: {
        successful: { type: 'number' },
        failed: { type: 'number' },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              error: { type: 'string' },
            },
          },
        },
        message: { type: 'string' },
      },
    },
  })
  @HttpCode(HttpStatus.CREATED)
  async bulkAddWriters(
    @Body() data: { memberIds: number[]; staffAkOptions?: AddStaffAkDto },
    @Request() req: any,
  ) {
    return this.adminStaffAkService.bulkAddSmfMembersAsStaffAk(
      data.memberIds,
      data.staffAkOptions || {},
      req.user.id,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get staff AK statistics for admin dashboard' })
  @ApiResponse({
    status: 200,
    description: 'Staff AK statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        total_staff_ak: { type: 'number' },
        total_smf_members: { type: 'number' },
        staff_ak_added_this_month: { type: 'number' },
        articles_this_month: { type: 'number' },
      },
    },
  })
  async getStaffAkStats() {
    return this.adminStaffAkService.getStaffAkStats();
  }

  @Delete(':id')
  @AuditLog(AuditActions.USER_DELETE, AuditTargets.USER)
  @ApiOperation({ summary: 'Remove a staff AK member from wp_users table' })
  @ApiParam({ name: 'id', description: 'WP User ID' })
  @ApiResponse({ status: 200, description: 'Staff AK member removed successfully' })
  @ApiResponse({ status: 404, description: 'Staff AK member not found' })
  async removeStaffAk(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.adminStaffAkService.removeStaffAk(id, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get staff AK member details by ID' })
  @ApiParam({ name: 'id', description: 'WP User ID' })
  @ApiResponse({
    status: 200,
    description: 'Staff AK member details retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Staff AK member not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.adminStaffAkService.findOne(id);
  }
}
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
import { AdminWritersService } from './admin-writers.service';
import { AddWriterDto } from './dto/add-writer.dto';
import { WriterQueryDto } from './dto/writer-query.dto';
import {
  AuditLog,
  AuditActions,
  AuditTargets,
} from '../../../common/decorators/audit-log.decorator';

@ApiTags('Admin - Writers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/writers')
export class AdminWritersController {
  constructor(private readonly adminWritersService: AdminWritersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all writers from wp_users table' })
  @ApiResponse({
    status: 200,
    description: 'Writers retrieved successfully with pagination',
  })
  async findAllWriters(@Query() query: WriterQueryDto) {
    return this.adminWritersService.findAllWriters(query);
  }

  @Get('smf-members')
  @ApiOperation({ summary: 'Get SMF members available to add as writers' })
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
    return this.adminWritersService.getSmfMembers(query);
  }

  @Post('add-from-smf/:id')
  @AuditLog(AuditActions.USER_CREATE, AuditTargets.USER)
  @ApiOperation({ summary: 'Add an SMF member to wp_users as a writer' })
  @ApiParam({ name: 'id', description: 'SMF Member ID' })
  @ApiResponse({
    status: 201,
    description: 'Writer added successfully',
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
    @Body() addWriterDto: AddWriterDto,
    @Request() req: any,
  ) {
    return this.adminWritersService.addSmfMemberAsWriter(
      id,
      addWriterDto,
      req.user.id,
    );
  }

  @Post('bulk-add')
  @AuditLog(AuditActions.USER_CREATE, AuditTargets.USER)
  @ApiOperation({ summary: 'Bulk add multiple SMF members as writers' })
  @ApiResponse({
    status: 201,
    description: 'Bulk writer addition completed',
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
    @Body() data: { memberIds: number[]; writerOptions?: AddWriterDto },
    @Request() req: any,
  ) {
    return this.adminWritersService.bulkAddSmfMembersAsWriters(
      data.memberIds,
      data.writerOptions || {},
      req.user.id,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get writer statistics for admin dashboard' })
  @ApiResponse({
    status: 200,
    description: 'Writer statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        total_writers: { type: 'number' },
        total_smf_members: { type: 'number' },
        writers_added_this_month: { type: 'number' },
        articles_this_month: { type: 'number' },
      },
    },
  })
  async getWriterStats() {
    return this.adminWritersService.getWriterStats();
  }

  @Delete(':id')
  @AuditLog(AuditActions.USER_DELETE, AuditTargets.USER)
  @ApiOperation({ summary: 'Remove a writer from wp_users table' })
  @ApiParam({ name: 'id', description: 'WP User ID' })
  @ApiResponse({ status: 200, description: 'Writer removed successfully' })
  @ApiResponse({ status: 404, description: 'Writer not found' })
  async removeWriter(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.adminWritersService.removeWriter(id, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get writer details by ID' })
  @ApiParam({ name: 'id', description: 'WP User ID' })
  @ApiResponse({
    status: 200,
    description: 'Writer details retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Writer not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.adminWritersService.findOne(id);
  }
}
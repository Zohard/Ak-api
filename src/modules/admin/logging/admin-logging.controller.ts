import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AdminLoggingService } from './admin-logging.service';

@ApiTags('Admin - Logging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/logs')
export class AdminLoggingController {
  constructor(private readonly adminLoggingService: AdminLoggingService) {}

  @Get('activities')
  @ApiOperation({ summary: 'Get recent admin activities grouped by content' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of content items to return',
    example: 50,
  })
  @ApiResponse({
    status: 200,
    description: 'Admin activities retrieved successfully',
  })
  async getActivities(@Query('limit', ParseIntPipe) limit = 50) {
    return this.adminLoggingService.getFormattedActivities(limit);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Get recent raw log entries' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of log entries to return',
    example: 100,
  })
  @ApiResponse({
    status: 200,
    description: 'Recent logs retrieved successfully',
  })
  async getRecentLogs(@Query('limit', ParseIntPipe) limit = 100) {
    return this.adminLoggingService.getRecentLogs(limit);
  }
}

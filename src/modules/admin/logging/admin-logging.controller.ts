import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
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
import {
  LogClientErrorDto,
  GetClientErrorsQueryDto,
} from './dto/client-error.dto';

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

  @Get('client-errors')
  @ApiOperation({ summary: 'Get client-side errors (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Client errors retrieved successfully',
  })
  async getClientErrors(@Query() query: GetClientErrorsQueryDto) {
    return this.adminLoggingService.getClientErrors(query);
  }

  @Get('client-errors/stats')
  @ApiOperation({ summary: 'Get client error statistics (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Client error statistics retrieved successfully',
  })
  async getClientErrorStats() {
    return this.adminLoggingService.getClientErrorStats();
  }

  @Post('client-errors/purge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Purge old client errors (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Old client errors purged successfully',
  })
  async purgeOldClientErrors(@Query('days') days?: number) {
    const daysToKeep = days ? parseInt(String(days)) : 30;
    const deletedCount = await this.adminLoggingService.purgeOldClientErrors(daysToKeep);
    return {
      success: true,
      message: `${deletedCount} old error(s) deleted`,
      deletedCount,
    };
  }
}

// Public controller for logging client errors (no auth required)
@ApiTags('Client Error Logging')
@Controller('client-errors')
export class ClientErrorLoggingController {
  constructor(private readonly adminLoggingService: AdminLoggingService) {}

  @Post('log')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Log a client-side error (public endpoint)' })
  @ApiResponse({
    status: 201,
    description: 'Error logged successfully',
  })
  async logError(@Body() errorDto: LogClientErrorDto, @Req() req: any) {
    // Optionally extract user ID from JWT if present
    const userId = req.user?.id || req.user?.id_member || null;

    // Extract user agent from request
    const userAgent = req.headers['user-agent'] || '';

    await this.adminLoggingService.logClientError({
      ...errorDto,
      userId,
      userAgent,
    });

    return { success: true, message: 'Error logged successfully' };
  }
}

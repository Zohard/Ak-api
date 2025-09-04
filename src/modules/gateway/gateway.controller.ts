import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  All,
  Req,
  Res,
  UseGuards,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { GatewayService } from './gateway.service';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Gateway')
@Controller('gateway')
@UseGuards(ThrottlerGuard)
export class GatewayController {
  private readonly logger = new Logger(GatewayController.name);

  constructor(private readonly gatewayService: GatewayService) {}

  @Get('health')
  @ApiOperation({ summary: 'Get gateway health status' })
  @ApiResponse({ status: 200, description: 'Gateway health information' })
  getHealth() {
    return this.gatewayService.getHealthStatus();
  }

  @Get('routes')
  @ApiOperation({ summary: 'Get all registered routes' })
  @ApiResponse({ status: 200, description: 'List of all gateway routes' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  getAllRoutes() {
    return {
      routes: this.gatewayService.getAllRoutes(),
      total: this.gatewayService.getAllRoutes().length,
    };
  }

  @All('*')
  @UseGuards(RateLimitGuard)
  async handleRequest(@Req() req: Request, @Res() res: Response) {
    const { method, path: requestPath } = req;
    const cleanPath = requestPath.replace('/api/gateway', '');
    
    this.logger.debug(`Gateway request: ${method} ${cleanPath}`);

    const route = this.gatewayService.findRoute(method, cleanPath);
    
    if (!route) {
      this.logger.warn(`No route found for: ${method} ${cleanPath}`);
      return res.status(HttpStatus.NOT_FOUND).json({
        error: 'Route not found',
        message: `No gateway route configured for ${method} ${cleanPath}`,
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const forwardedPath = cleanPath.replace(/^\/[^\/]+/, '');
      const targetUrl = `/api${forwardedPath}`;
      
      req.url = targetUrl;
      req.originalUrl = targetUrl;
      
      this.logger.debug(`Forwarding ${method} ${cleanPath} -> ${targetUrl}`);
      
      return res.status(HttpStatus.OK).json({
        message: 'Request processed by gateway',
        route: route.target,
        originalPath: cleanPath,
        forwardedPath: targetUrl,
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      this.logger.error(`Gateway error for ${method} ${cleanPath}:`, error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Gateway processing error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
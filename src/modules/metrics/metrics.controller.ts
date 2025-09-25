import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MetricsService } from '../../shared/services/metrics.service';

export class TrackViewClickDto {
  section: string;
  itemType: string;
  itemId: string | number;
}

export class TrackPageViewDto {
  page: string;
  userId?: string;
}

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @ApiOperation({ summary: 'Get Prometheus metrics' })
  @ApiResponse({ status: 200, description: 'Metrics in Prometheus format' })
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }

  @Post('pageview')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Track page view' })
  @ApiResponse({ status: 204, description: 'Page view tracked successfully' })
  async trackPageView(@Body() dto: TrackPageViewDto): Promise<void> {
    this.metricsService.trackPageView(dto.page, dto.userId);
  }

  @Post('homepage/view-click')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Track homepage view click' })
  @ApiResponse({ status: 204, description: 'View click tracked successfully' })
  async trackViewClick(@Body() dto: TrackViewClickDto): Promise<void> {
    this.metricsService.trackHomepageViewClick(
      dto.section,
      dto.itemType,
      dto.itemId
    );
  }
}
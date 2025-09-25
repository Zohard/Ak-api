import { Injectable } from '@nestjs/common';
import { register, Counter, Histogram, collectDefaultMetrics, Pushgateway, PrometheusContentType } from 'prom-client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MetricsService {
  private readonly pageViewCounter: Counter<string>;
  private readonly apiDuration: Histogram<string>;
  private readonly gateway: Pushgateway<PrometheusContentType> | null = null;

  constructor(private readonly configService: ConfigService) {
    // Enable default metrics collection (memory, CPU, etc.)
    collectDefaultMetrics({ register });

    // Setup Grafana push gateway if configured
    const grafanaUrl = this.configService.get('GRAFANA_PUSH_URL');
    const grafanaUser = this.configService.get('GRAFANA_PUSH_USER');
    const grafanaPassword = this.configService.get('GRAFANA_PUSH_PASSWORD');

    if (grafanaUrl && grafanaUser && grafanaPassword) {
      this.gateway = new Pushgateway(grafanaUrl, {
        username: grafanaUser,
        password: grafanaPassword
      });
    }

    // Page view counter
    this.pageViewCounter = new Counter({
      name: 'homepage_view_clicks_total',
      help: 'Total number of view clicks on homepage sections',
      labelNames: ['section', 'item_type', 'item_id'],
      registers: [register]
    });

    // API response time histogram
    this.apiDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
      registers: [register]
    });
  }

  /**
   * Track a view click on the homepage
   */
  trackHomepageViewClick(section: string, itemType: string, itemId: string | number) {
    this.pageViewCounter.inc({
      section,
      item_type: itemType,
      item_id: itemId.toString()
    });
  }

  /**
   * Track general page view
   */
  trackPageView(page: string, userId?: string) {
    this.pageViewCounter.inc({
      section: 'pageview',
      item_type: 'page',
      item_id: page
    });
  }

  /**
   * Track API request duration
   */
  trackApiDuration(method: string, route: string, statusCode: number, durationMs: number) {
    this.apiDuration.observe(
      { method, route, status_code: statusCode.toString() },
      durationMs / 1000
    );
  }

  /**
   * Get all metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  /**
   * Get specific metric values (for debugging)
   */
  async getPageViewMetrics() {
    const metrics = await register.getSingleMetricAsString('homepage_view_clicks_total');
    return metrics;
  }
}
import { Injectable } from '@nestjs/common';
import { register, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly pageViewCounter: Counter<string>;
  private readonly apiDuration: Histogram<string>;

  constructor() {
    // Enable default metrics collection (memory, CPU, etc.)
    collectDefaultMetrics({ register });

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
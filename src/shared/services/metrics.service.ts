import { Injectable } from '@nestjs/common';
import { register, Counter, Histogram, Gauge, collectDefaultMetrics, Pushgateway, PrometheusContentType } from 'prom-client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MetricsService {
  private readonly pageViewCounter: Counter<string>;
  private readonly apiDuration: Histogram<string>;
  private readonly authCounter: Counter<string>;
  private readonly dbQueryDuration: Histogram<string>;
  private readonly cacheHitRatio: Counter<string>;
  private readonly businessMetrics: Counter<string>;
  private readonly errorCounter: Counter<string>;
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

    // Authentication metrics
    this.authCounter = new Counter({
      name: 'auth_attempts_total',
      help: 'Total number of authentication attempts',
      labelNames: ['type', 'status', 'method'],
      registers: [register]
    });

    // Database query performance
    this.dbQueryDuration = new Histogram({
      name: 'db_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table', 'endpoint'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [register]
    });

    // Cache hit/miss tracking
    this.cacheHitRatio = new Counter({
      name: 'cache_operations_total',
      help: 'Total cache operations',
      labelNames: ['operation', 'key_type', 'result'],
      registers: [register]
    });

    // Business metrics
    this.businessMetrics = new Counter({
      name: 'business_events_total',
      help: 'Total business events',
      labelNames: ['event_type', 'category', 'user_type'],
      registers: [register]
    });

    // Error tracking
    this.errorCounter = new Counter({
      name: 'application_errors_total',
      help: 'Total application errors',
      labelNames: ['endpoint', 'error_type', 'severity'],
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
   * Track authentication attempts
   */
  trackAuthAttempt(type: 'login' | 'register' | 'logout', status: 'success' | 'failure', method: string = 'local') {
    this.authCounter.inc({
      type,
      status,
      method
    });
  }

  /**
   * Track database query performance
   */
  trackDbQuery(operation: string, table: string, endpoint: string, durationMs: number) {
    this.dbQueryDuration.observe(
      { operation, table, endpoint },
      durationMs / 1000
    );
  }

  /**
   * Track cache operations
   */
  trackCacheOperation(operation: 'get' | 'set' | 'del', keyType: string, result: 'hit' | 'miss' | 'success' | 'error') {
    this.cacheHitRatio.inc({
      operation,
      key_type: keyType,
      result
    });
  }

  /**
   * Track business events
   */
  trackBusinessEvent(eventType: string, category: string, userType: string = 'anonymous') {
    this.businessMetrics.inc({
      event_type: eventType,
      category,
      user_type: userType
    });
  }

  /**
   * Track application errors
   */
  trackError(endpoint: string, errorType: string, severity: 'low' | 'medium' | 'high' | 'critical') {
    this.errorCounter.inc({
      endpoint,
      error_type: errorType,
      severity
    });
  }

  /**
   * Get specific metric values (for debugging)
   */
  async getPageViewMetrics() {
    const metrics = await register.getSingleMetricAsString('homepage_view_clicks_total');
    return metrics;
  }
}
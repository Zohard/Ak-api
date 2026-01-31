import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query' | 'error' | 'info' | 'warn'>
  implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const effectiveUrl = PrismaService.getEffectiveUrl();

    // Only log errors and warnings in production, add query logging in dev
    const isProduction = process.env.NODE_ENV === 'production';

    super({
      datasources: {
        db: {
          url: effectiveUrl,
        },
      },
      log: isProduction
        ? [
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ]
        : [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ],
      transactionOptions: {
        timeout: 30000, // 30 seconds for cold starts
      },
    });
  }

  private static getEffectiveUrl(): string {
    // Prepare a serverless-friendly connection string for Supabase pgBouncer
    // and disable prepared statements when using a pooled connection.
    const originalUrl = process.env.DATABASE_URL || '';
    let effectiveUrl = originalUrl;

    try {
      if (originalUrl) {
        const u = new URL(originalUrl);
        const isSupabase = u.hostname.includes('supabase.com');
        const isNeon = u.hostname.includes('neon.tech');
        const isRailway = u.hostname.includes('railway.app') || u.hostname.includes('railway.internal');
        const isPooler = u.hostname.includes('pooler');

        const params = u.searchParams;

        // Railway PostgreSQL - direct connection (not a pooler)
        if (isRailway) {
          // Railway needs higher connection limit since it's not pooled
          if (!params.has('connection_limit')) {
            params.set('connection_limit', '10');
          }
          // Shorter timeouts for Railway's fast network
          params.set('pool_timeout', '10');
          params.set('connect_timeout', '10');
          // Statement cache for better performance on direct connections
          params.set('statement_cache_size', '100');

          u.search = params.toString();
          effectiveUrl = u.toString();

          // Note: Cannot log here as this is a static method called before super()
        }
        // Apply optimizations for any pooler endpoint (Supabase or Neon)
        else if ((isSupabase && isPooler) || (isNeon && isPooler)) {
          // CRITICAL: Remove channel_binding - pgBouncer doesn't support it
          params.delete('channel_binding');

          // Ensure TLS is enabled
          params.set('sslmode', 'require');
          // Tell Prisma we are behind pgBouncer (disables prepared statements)
          params.set('pgbouncer', 'true');

          // Force conservative connection limit for serverless (max 5)
          const currentLimit = parseInt(params.get('connection_limit') || '5', 10);
          if (currentLimit > 5) {
            params.set('connection_limit', '5');
          } else if (!params.has('connection_limit')) {
            params.set('connection_limit', '5');
          }

          // Pool timeout - give enough time for cold starts
          params.set('pool_timeout', '20');
          // Connect timeout for Neon cold starts (longer for initial wake)
          params.set('connect_timeout', '30');

          u.search = params.toString();
          effectiveUrl = u.toString();

          // Extra safety: make sure prepared statements are disabled
          process.env.PRISMA_DISABLE_PREPARED_STATEMENTS = 'true';
        }
      }
    } catch (e) {
      // If URL parsing fails, fall back to the original value
      Logger.warn(
        'Failed to normalize DATABASE_URL for serverless pooling',
        PrismaService.name,
      );
    }
    return effectiveUrl;
  }

  async onModuleInit() {
    // Add retry logic for initial connection
    const maxRetries = 3;
    let retries = maxRetries;

    while (retries > 0) {
      try {
        await this.$connect();

        // Log slow queries in all environments (> 500ms)
        this.$on('query', (e: Prisma.QueryEvent) => {
          if (e.duration > 500) {
            this.logger.warn(`🐌 SLOW QUERY (${e.duration}ms): ${e.query.substring(0, 200)}...`);
          } else if (process.env.NODE_ENV !== 'production') {
            this.logger.debug(`Query: ${e.query} - Duration: ${e.duration}ms`);
          }
        });

        this.$on('error', (e: Prisma.LogEvent) => {
          this.logger.error(`Database error: ${e.message}`);
        });

        this.$on('warn', (e: Prisma.LogEvent) => {
          this.logger.warn(`Database warning: ${e.message}`);
        });

        break;
      } catch (error) {
        retries--;
        const attempt = maxRetries - retries;
        this.logger.error(`Database connection failed (attempt ${attempt}/${maxRetries}): ${error.message}`);

        if (retries === 0) {
          this.logger.error('All database connection attempts failed');
          throw error;
        }

        // Wait 2 seconds before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Override disconnect to handle graceful shutdown
  async disconnect() {
    try {
      await this.$disconnect();
    } catch (error) {
      this.logger.error('Error during Prisma disconnect:', error.message);
    }
  }

  // Add connection pool management
  async ensureConnection(): Promise<void> {
    try {
      await this.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.warn('Connection lost, attempting to reconnect...');
      try {
        await this.$disconnect();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.$connect();
      } catch (reconnectError) {
        this.logger.error('Failed to reconnect:', reconnectError);
        throw reconnectError;
      }
    }
  }

  // Add a health check method
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Health check failed:', error.message);
      return false;
    }
  }

  // Diagnostic method to measure database latency
  async measureLatency(): Promise<{ latency: number; connectionCount: number; dbVersion: string }> {
    const start = Date.now();

    try {
      const [pingResult, connectionResult, versionResult] = await Promise.all([
        this.$queryRaw`SELECT 1 as ping`,
        this.$queryRaw`SELECT count(*) as connections FROM pg_stat_activity WHERE state = 'active'`,
        this.$queryRaw`SELECT version() as version`
      ]);

      const latency = Date.now() - start;
      const connectionCount = Number((connectionResult as any[])[0]?.connections || 0);
      const dbVersion = ((versionResult as any[])[0]?.version || '').split(' ').slice(0, 2).join(' ');

      if (latency > 100) {
        this.logger.warn(`⚠️ High database latency: ${latency}ms`);
      }

      return { latency, connectionCount, dbVersion };
    } catch (error) {
      this.logger.error('Latency measurement failed:', error.message);
      throw error;
    }
  }

  // Graceful query execution with retry logic for connection errors
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Check if it's a connection-related error
        if (
          error.code === 'P2024' || // Connection timeout
          error.code === 'P2034' || // Transaction failed
          error.message?.includes('Max client connections reached') ||
          error.message?.includes('connection') ||
          error.message?.includes('FATAL')
        ) {
          this.logger.warn(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error.message);

          if (attempt < maxRetries) {
            // For max connections error, force disconnect to free up connections
            if (error.message?.includes('Max client connections reached')) {
              try {
                await this.$disconnect();
                await new Promise(resolve => setTimeout(resolve, 500));
              } catch (disconnectError) {
                this.logger.warn('Failed to disconnect:', disconnectError.message);
              }
            }

            // Exponential backoff with jitter
            const baseDelay = Math.pow(2, attempt - 1) * 1000;
            const jitter = Math.random() * 1000;
            const delay = baseDelay + jitter;
            await new Promise(resolve => setTimeout(resolve, delay));

            // Try to reconnect
            try {
              await this.$disconnect();
              await new Promise(resolve => setTimeout(resolve, 200));
              await this.$connect();
            } catch (reconnectError) {
              this.logger.error('Failed to reconnect:', reconnectError);
            }

            continue;
          }
        }

        throw error;
      }
    }

    throw lastError;
  }
}

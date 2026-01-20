import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query' | 'error' | 'info' | 'warn'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Prepare a serverless-friendly connection string for Supabase pgBouncer
    // and disable prepared statements when using a pooled connection.
    const originalUrl = process.env.DATABASE_URL || '';
    let effectiveUrl = originalUrl;

    try {
      if (originalUrl) {
        const u = new URL(originalUrl);
        const isSupabase = u.hostname.includes('supabase.com');
        const isPooler = u.hostname.includes('pooler');

        // Apply optimizations for any pooler endpoint (Supabase or Neon)
        if (isSupabase && isPooler || u.hostname.includes('neon.tech') && isPooler) {
          const params = u.searchParams;
          // Ensure TLS is enabled
          if (!params.has('sslmode')) params.set('sslmode', 'require');
          // Tell Prisma we are behind pgBouncer (disables prepared statements)
          if (!params.has('pgbouncer')) params.set('pgbouncer', 'true');
          // Optimize connections for serverless - VERY conservative for Neon
          if (!params.has('connection_limit')) params.set('connection_limit', '5');
          // Pool timeout - longer for Neon cold starts
          if (!params.has('pool_timeout')) params.set('pool_timeout', '30');
          // Add connect timeout - longer for Neon cold starts (can take 5-10s)
          if (!params.has('connect_timeout')) params.set('connect_timeout', '30');

          u.search = params.toString();
          effectiveUrl = u.toString();

          // Extra safety: make sure prepared statements are disabled
          process.env.PRISMA_DISABLE_PREPARED_STATEMENTS = 'true';
        }
      }
    } catch (e) {
      // If URL parsing fails, fall back to the original value
      // Avoid using `this` before `super()`; use static Logger
      Logger.warn(
        'Failed to normalize DATABASE_URL for serverless pooling',
        PrismaService.name,
      );
    }

    super({
      datasources: {
        db: {
          url: effectiveUrl,
        },
      },
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'event', 
          level: 'error',
        },
        {
          emit: 'event',
          level: 'info',
        },
        {
          emit: 'event',
          level: 'warn',
        },
      ],
      // Optimize for Neon/Supabase - longer timeout for cold starts
      transactionOptions: {
        timeout: 30000, // 30 seconds for cold start scenarios
      },
    });
  }

  async onModuleInit() {
    // Add retry logic for initial connection - more retries for Neon cold starts
    const maxRetries = 5;
    let retries = maxRetries;

    while (retries > 0) {
      try {
        const startTime = Date.now();
        await this.$connect();
        const duration = Date.now() - startTime;

        this.logger.log(`Database connected successfully in ${duration}ms`);

        if (duration > 3000) {
          this.logger.warn(`Database was cold - connection took ${duration}ms`);
        }

        // Set up query logging
        this.$on('query', (e: Prisma.QueryEvent) => {
          this.logger.debug(`Query: ${e.query} - Duration: ${e.duration}ms`);
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

        // Exponential backoff: 2s, 4s, 8s, 16s
        const delay = Math.pow(2, attempt) * 1000;
        this.logger.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  // Override disconnect to handle graceful shutdown
  async disconnect() {
    try {
      await this.$disconnect();
      this.logger.log('Prisma client disconnected gracefully');
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

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query' | 'error' | 'info' | 'warn'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
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
      // Optimize for Supabase connection pooling
      transactionOptions: {
        timeout: 10000, // 10 seconds
      },
    });
  }

  async onModuleInit() {
    // Add retry logic for initial connection
    let retries = 3;
    while (retries > 0) {
      try {
        await this.$connect();
        this.logger.log('Database connected successfully');
        
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
        this.logger.error(`Database connection failed. Retries left: ${retries}`, error.message);
        
        if (retries === 0) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
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
}

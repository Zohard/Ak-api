import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class DatabaseWarmupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseWarmupService.name);
  private keepaliveInterval: NodeJS.Timeout | null = null;

  // Keepalive interval in ms (4 minutes - Neon sleeps after 5 min of inactivity)
  private readonly KEEPALIVE_INTERVAL = 4 * 60 * 1000;

  // Max retries for warmup
  private readonly MAX_WARMUP_RETRIES = 5;

  // Delay between retries (starts at 1s, increases exponentially)
  private readonly INITIAL_RETRY_DELAY = 1000;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Start keepalive interval to prevent Neon from sleeping
    // Note: PrismaService already handles connection retries on startup,
    // so we don't block here with a warmup - just start the keepalive
    this.startKeepalive();

    // Do a non-blocking warmup in the background
    this.warmupDatabase().catch(err => {
      this.logger.warn(`Background warmup failed: ${err.message}`);
    });
  }

  onModuleDestroy() {
    this.stopKeepalive();
  }

  /**
   * Warmup the database connection with retries
   * This ensures the database is awake before accepting requests
   */
  async warmupDatabase(): Promise<boolean> {
    this.logger.log('Starting database warmup...');

    for (let attempt = 1; attempt <= this.MAX_WARMUP_RETRIES; attempt++) {
      try {
        const startTime = Date.now();

        // Simple query to wake up the database
        await this.prisma.$queryRaw`SELECT 1 as warmup`;

        const duration = Date.now() - startTime;
        this.logger.log(`Database warmup successful (attempt ${attempt}, ${duration}ms)`);

        // If it took more than 2 seconds, the database was likely cold
        if (duration > 2000) {
          this.logger.warn(`Database was cold - warmup took ${duration}ms`);
        }

        return true;
      } catch (error: any) {
        const delay = this.INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);

        this.logger.warn(
          `Database warmup failed (attempt ${attempt}/${this.MAX_WARMUP_RETRIES}): ${error.message}`
        );

        if (attempt < this.MAX_WARMUP_RETRIES) {
          this.logger.log(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    this.logger.error('Database warmup failed after all retries');
    return false;
  }

  /**
   * Start the keepalive interval to prevent database from sleeping
   */
  private startKeepalive() {
    if (this.keepaliveInterval) {
      return;
    }

    this.logger.log(`Starting database keepalive (interval: ${this.KEEPALIVE_INTERVAL / 1000}s)`);

    this.keepaliveInterval = setInterval(async () => {
      try {
        const startTime = Date.now();
        await this.prisma.$queryRaw`SELECT 1 as keepalive`;
        const duration = Date.now() - startTime;

        // Only log if it took longer than expected (possible cold start)
        if (duration > 500) {
          this.logger.warn(`Keepalive ping took ${duration}ms (possible cold start)`);
        } else {
          this.logger.debug(`Keepalive ping: ${duration}ms`);
        }
      } catch (error: any) {
        this.logger.error(`Keepalive ping failed: ${error.message}`);

        // Try to reconnect
        try {
          await this.prisma.$disconnect();
          await this.sleep(1000);
          await this.prisma.$connect();
          this.logger.log('Reconnected after keepalive failure');
        } catch (reconnectError: any) {
          this.logger.error(`Failed to reconnect: ${reconnectError.message}`);
        }
      }
    }, this.KEEPALIVE_INTERVAL);
  }

  /**
   * Stop the keepalive interval
   */
  private stopKeepalive() {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
      this.logger.log('Database keepalive stopped');
    }
  }

  /**
   * Manual warmup method - can be called from health endpoint
   */
  async manualWarmup(): Promise<{ success: boolean; duration: number }> {
    const startTime = Date.now();
    const success = await this.warmupDatabase();
    return {
      success,
      duration: Date.now() - startTime,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

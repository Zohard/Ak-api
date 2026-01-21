import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class DatabaseWarmupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseWarmupService.name);
  private keepaliveInterval: NodeJS.Timeout | null = null;

  // Keepalive interval in ms (3 minutes - balance between preventing cold starts and compute usage)
  private readonly KEEPALIVE_INTERVAL = 3 * 60 * 1000;

  // Max retries for warmup
  private readonly MAX_WARMUP_RETRIES = 5;

  // Delay between retries (starts at 2s for cold start, increases exponentially)
  private readonly INITIAL_RETRY_DELAY = 2000;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Start keepalive interval to prevent Neon from sleeping
    this.startKeepalive();

    // Do a non-blocking warmup in the background (silent)
    this.warmupDatabase().catch(() => {});
  }

  onModuleDestroy() {
    this.stopKeepalive();
  }

  /**
   * Warmup the database connection with retries
   */
  async warmupDatabase(): Promise<boolean> {
    for (let attempt = 1; attempt <= this.MAX_WARMUP_RETRIES; attempt++) {
      try {
        await this.prisma.$queryRaw`SELECT 1 as warmup`;
        return true;
      } catch (error: any) {
        if (attempt < this.MAX_WARMUP_RETRIES) {
          const delay = this.INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }
    return false;
  }

  /**
   * Start the keepalive interval to prevent database from sleeping
   */
  private startKeepalive() {
    if (this.keepaliveInterval) {
      return;
    }

    this.keepaliveInterval = setInterval(async () => {
      try {
        await this.prisma.$queryRaw`SELECT 1 as keepalive`;
      } catch (error: any) {
        // Try to reconnect silently
        try {
          await this.prisma.$disconnect();
          await this.sleep(1000);
          await this.prisma.$connect();
        } catch (reconnectError: any) {
          this.logger.error(`Keepalive reconnect failed: ${reconnectError.message}`);
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

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

@Injectable()
export class SystemSettingsService {
    private readonly logger = new Logger(SystemSettingsService.name);
    private readonly CACHE_KEY_PREFIX = 'system_setting:';
    private readonly STATUS_CACHE_KEY = 'system_status';
    private readonly STATUS_TTL = 30; // 30 seconds cache for public status check

    constructor(
        private readonly prisma: PrismaService,
        private readonly cacheService: CacheService
    ) { }

    /**
     * Get public system status (maintenance mode, etc.)
     * Heavily cached to prevent DB spam.
     */
    async getSystemStatus() {
        const cached = await this.cacheService.get<{ maintenance: boolean, message?: string }>(this.STATUS_CACHE_KEY);
        if (cached) {
            return cached;
        }

        const maintenance = await this.getSetting('maintenance_mode');
        const message = await this.getSetting('maintenance_message');

        const status = {
            maintenance: maintenance === 'true',
            message: message || undefined
        };

        await this.cacheService.set(this.STATUS_CACHE_KEY, status, this.STATUS_TTL);
        return status;
    }

    /**
     * Get a raw setting value by key
     */
    async getSetting(key: string): Promise<string | null> {
        const cacheKey = `${this.CACHE_KEY_PREFIX}${key}`;
        const cached = await this.cacheService.get<string>(cacheKey);
        if (cached) return cached;

        const setting = await this.prisma.akSystemSetting.findUnique({
            where: { key }
        });

        if (setting) {
            // Cache individual settings for longer
            await this.cacheService.set(cacheKey, setting.value, 300);
        }

        return setting?.value || null;
    }

    /**
     * Get all settings (Admin only)
     */
    async getAllSettings() {
        return this.prisma.akSystemSetting.findMany({
            orderBy: { key: 'asc' }
        });
    }

    /**
     * Update a setting
     */
    async updateSetting(key: string, value: string) {
        this.logger.log(`Updating system setting: ${key} = ${value}`);

        const setting = await this.prisma.akSystemSetting.upsert({
            where: { key },
            update: { value },
            create: { key, value }
        });

        // Invalidate caches
        await this.cacheService.del(`${this.CACHE_KEY_PREFIX}${key}`);
        await this.cacheService.del(this.STATUS_CACHE_KEY);

        return setting;
    }
}

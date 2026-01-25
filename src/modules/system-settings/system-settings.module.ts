import { Module } from '@nestjs/common';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';

@Module({
    controllers: [SystemSettingsController],
    providers: [SystemSettingsService, PrismaService, CacheService],
    exports: [SystemSettingsService]
})
export class SystemSettingsModule { }

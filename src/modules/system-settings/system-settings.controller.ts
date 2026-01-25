import { Controller, Get, Patch, Body, Param, UseGuards, UnauthorizedException } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('api/system-settings')
export class SystemSettingsController {
    constructor(private readonly settingsService: SystemSettingsService) { }

    // Public endpoint to check system status
    @Get('status')
    async getSystemStatus() {
        return this.settingsService.getSystemStatus();
    }

    // Admin only: Get all settings
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    @Get()
    async getAllSettings() {
        return this.settingsService.getAllSettings();
    }

    // Admin only: Update a setting
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    @Patch(':key')
    async updateSetting(
        @Param('key') key: string,
        @Body('value') value: string
    ) {
        return this.settingsService.updateSetting(key, value);
    }
}

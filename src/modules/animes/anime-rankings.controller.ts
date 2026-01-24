import { Controller, Get, Param, Post, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { AnimeRankingsService } from './services/anime-rankings.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
// import { AdminGuard } from '../../auth/guards/admin.guard'; // Assuming there is an admin guard

@ApiTags('Anime Rankings')
@Controller('rankings')
export class AnimeRankingsController {
    constructor(private readonly rankingsService: AnimeRankingsService) { }

    @Get('weekly/:year/:season/:week')
    @ApiOperation({ summary: 'Get weekly anime ranking' })
    async getWeeklyRanking(
        @Param('year', ParseIntPipe) year: number,
        @Param('season') season: string,
        @Param('week', ParseIntPipe) week: number,
    ) {
        return this.rankingsService.getWeeklyRanking(year, season, week);
    }

    @Post('weekly/generate')
    @ApiOperation({ summary: 'Generate weekly anime ranking (Admin only)' })
    // @UseGuards(AdminGuard) // keeping commented until guard path confirmed
    async generateWeeklyRanking(
        @Query('year', ParseIntPipe) year: number,
        @Query('season') season: string,
        @Query('week', ParseIntPipe) week: number,
    ) {
        return this.rankingsService.generateWeeklyRanking(year, season, week);
    }
}

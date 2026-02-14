import { Controller, Get, Param, Post, ParseIntPipe, Query, UseGuards, Res, Req, HttpStatus, Options } from '@nestjs/common';
import { AnimeRankingsService } from './services/anime-rankings.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HttpService } from '@nestjs/axios';
import { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';
// import { AdminGuard } from '../../auth/guards/admin.guard'; // Assuming there is an admin guard

@ApiTags('Anime Rankings')
@Controller('animes/rankings')
export class AnimeRankingsController {
    constructor(
        private readonly rankingsService: AnimeRankingsService,
        private readonly httpService: HttpService,
    ) { }

    @Get('weekly/current')
    @ApiOperation({ summary: 'Get weekly anime ranking for the current week' })
    async getCurrentWeeklyRanking() {
        const { year, season, week } = this.getCurrentSeasonInfo();
        return this.rankingsService.getWeeklyRanking(year, season, week);
    }

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

    @Options('proxy-image')
    async proxyImageOptions(@Res() res: Response) {
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        return res.sendStatus(HttpStatus.NO_CONTENT);
    }

    @Get('proxy-image')
    @ApiOperation({ summary: 'Proxy image for share card generation (CORS bypass)' })
    async proxyImage(
        @Query('url') url: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        if (!url) {
            return res.status(HttpStatus.BAD_REQUEST).send('URL parameter required');
        }

        // Declare imageUrl outside try block so it's accessible in catch
        let imageUrl = url;

        try {
            // Handle relative URLs (internal API images)
            if (url.startsWith('/api/')) {
                // Build the full URL using the request's protocol and host
                const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
                const host = req.headers['x-forwarded-host'] || req.headers.host || 'ak-api-production.up.railway.app';
                imageUrl = `${protocol}://${host}${url}`;
            }

            console.log('Proxy fetching image from:', imageUrl);

            const response = await firstValueFrom(
                this.httpService.get(imageUrl, {
                    responseType: 'arraybuffer',
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Anime-Kun-Share-Bot/1.0',
                    },
                    maxRedirects: 5,
                })
            );

            const contentType = response.headers['content-type'] || 'image/jpeg';
            console.log('Successfully proxied image:', imageUrl, 'Content-Type:', contentType);

            res.set({
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
            });

            return res.send(Buffer.from(response.data));
        } catch (error) {
            console.error('Proxy image error:', error.message, 'URL:', imageUrl, 'Original:', url);
            if (error.response) {
                console.error('Response status:', error.response.status, error.response.statusText);
            }
            // Set CORS headers even on error
            res.set({
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
            });
            return res.status(HttpStatus.BAD_GATEWAY).send('Failed to fetch image');
        }
    }

    private getCurrentSeasonInfo(): { year: number; season: string; week: number } {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth(); // 0-indexed

        // Determine season based on month
        let season: string;
        if (month >= 0 && month <= 2) {
            season = 'WINTER'; // Jan-Mar
        } else if (month >= 3 && month <= 5) {
            season = 'SPRING'; // Apr-Jun
        } else if (month >= 6 && month <= 8) {
            season = 'SUMMER'; // Jul-Sep
        } else {
            season = 'FALL'; // Oct-Dec
        }

        // Calculate ISO week number
        const week = this.getISOWeek(now);

        return { year, season, week };
    }

    private getISOWeek(date: Date): number {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    }
}

import { Controller, Get, Param, Post, ParseIntPipe, Query, UseGuards, Res, Req, HttpStatus } from '@nestjs/common';
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

        try {
            // Handle relative URLs (internal API images)
            let imageUrl = url;
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

            res.set({
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
            });

            return res.send(Buffer.from(response.data));
        } catch (error) {
            console.error('Proxy image error:', error.message, 'URL:', url);
            return res.status(HttpStatus.BAD_GATEWAY).send('Failed to fetch image');
        }
    }
}

import {
    Controller,
    Get,
    Post,
    Body,
    HttpCode,
    HttpStatus,
    Query,
    UseGuards,
    Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GamesService } from './games.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/decorators/current-user.decorator';

@ApiTags('Games')
@Controller('games')
export class GamesController {
    constructor(private readonly gamesService: GamesService) { }

    /** Clamps a raw gameNumber query param to [0, today]. Returns undefined if invalid. */
    private parseGameNumber(raw: any): number | undefined {
        if (raw === undefined || raw === null || raw === '') return undefined;
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0) return undefined;
        return Math.min(n, this.gamesService.getGameNumber());
    }

    // ─── Anime Guess Game ────────────────────────────────────────────────────

    @Get('anime/daily')
    @ApiOperation({ summary: "Get today's anime game metadata" })
    @ApiResponse({ status: 200, description: 'Game metadata retrieved successfully' })
    async getDailyMetadata(@Query('gameNumber') rawGn?: string) {
        const gameNumber = this.parseGameNumber(rawGn) ?? this.gamesService.getGameNumber();
        return {
            gameNumber,
            title: `Guess the Anime #${gameNumber}`,
        };
    }

    @Get('anime/state')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: "Get user's daily game state including current streak" })
    async getGameState(@CurrentUser() user: CurrentUserData, @Query('gameNumber') rawGn?: string) {
        const gameNumber = this.parseGameNumber(rawGn);
        return this.gamesService.getFullGameState(user.id, gameNumber);
    }

    @Get('anime/hint')
    @UseGuards(OptionalJwtAuthGuard)
    @ApiOperation({ summary: 'Get a hint for the daily anime' })
    @ApiResponse({ status: 200, description: 'Hint retrieved successfully' })
    async getHint(@Query('attempts') attempts: number, @Query('gameNumber') rawGn: string, @Req() req: any) {
        const gameNumber = this.parseGameNumber(rawGn);
        const userId = req.user?.id;
        const safeAttempts = await this.gamesService.resolveAttempts(attempts, userId, 'anime', gameNumber);
        return this.gamesService.getHint(safeAttempts, gameNumber);
    }

    @Post('anime/guess')
    @HttpCode(HttpStatus.OK)
    @UseGuards(OptionalJwtAuthGuard)
    @ApiOperation({ summary: 'Submit an anime guess' })
    @ApiResponse({ status: 200, description: 'Guess comparison result' })
    async submitGuess(
        @Body('animeId') animeId: number,
        @Body('gameNumber') rawGn: any,
        @Req() req: any,
    ) {
        const gameNumber = this.parseGameNumber(rawGn);
        const userId = req.user?.id;
        return this.gamesService.compareGuess(animeId, userId, gameNumber);
    }

    // ─── Jeux-Vidéo Guess Game ───────────────────────────────────────────────

    @Get('jeux/daily')
    @ApiOperation({ summary: "Get today's jeux-vidéo game metadata" })
    async getDailyMetadataJeux(@Query('gameNumber') rawGn?: string) {
        const gameNumber = this.parseGameNumber(rawGn) ?? this.gamesService.getGameNumber();
        return { gameNumber, title: `Ani-Kun Guess Jeux #${gameNumber}` };
    }

    @Get('jeux/state')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: "Get user's daily jeux game state" })
    async getGameStateJeux(@CurrentUser() user: CurrentUserData, @Query('gameNumber') rawGn?: string) {
        const gameNumber = this.parseGameNumber(rawGn);
        return this.gamesService.getFullGameStateJeux(user.id, gameNumber);
    }

    @Get('jeux/hint')
    @UseGuards(OptionalJwtAuthGuard)
    @ApiOperation({ summary: 'Get a hint for the daily jeu' })
    async getHintJeux(@Query('attempts') attempts: number, @Query('gameNumber') rawGn: string, @Req() req: any) {
        const gameNumber = this.parseGameNumber(rawGn);
        const userId = req.user?.id;
        const safeAttempts = await this.gamesService.resolveAttempts(attempts, userId, 'jeux', gameNumber);
        return this.gamesService.getHintJeux(safeAttempts, gameNumber);
    }

    @Post('jeux/guess')
    @HttpCode(HttpStatus.OK)
    @UseGuards(OptionalJwtAuthGuard)
    @ApiOperation({ summary: 'Submit a jeu-vidéo guess' })
    async submitGuessJeux(
        @Body('jeuId') jeuId: number,
        @Body('gameNumber') rawGn: any,
        @Req() req: any,
    ) {
        const gameNumber = this.parseGameNumber(rawGn);
        const userId = req.user?.id;
        return this.gamesService.compareGuessJeux(jeuId, userId, gameNumber);
    }

    // ─── Screenshot Guess Game ───────────────────────────────────────────────

    @Get('screenshot/daily')
    @ApiOperation({ summary: "Get today's screenshot game metadata" })
    async getDailyMetadataScreenshot(@Query('gameNumber') rawGn?: string) {
        const gameNumber = this.parseGameNumber(rawGn) ?? this.gamesService.getGameNumber();
        const { screenshot } = await this.gamesService.getDailyTargetScreenshot(gameNumber);

        return {
            gameNumber,
            title: `Screenshot du jour #${gameNumber}`,
            screenshotUrl: screenshot.urlScreen,
        };
    }

    @Get('screenshot/state')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: "Get user's daily screenshot game state" })
    async getGameStateScreenshot(@CurrentUser() user: CurrentUserData, @Query('gameNumber') rawGn?: string) {
        const gameNumber = this.parseGameNumber(rawGn);
        return this.gamesService.getFullGameStateScreenshot(user.id, gameNumber);
    }

    @Get('screenshot/hint')
    @UseGuards(OptionalJwtAuthGuard)
    @ApiOperation({ summary: 'Get a hint for the daily screenshot game' })
    async getHintScreenshot(@Query('attempts') attempts: number, @Query('gameNumber') rawGn: string, @Req() req: any) {
        const gameNumber = this.parseGameNumber(rawGn);
        const userId = req.user?.id;
        const safeAttempts = await this.gamesService.resolveAttempts(attempts, userId, 'screenshot', gameNumber);
        return this.gamesService.getHintScreenshot(safeAttempts, gameNumber);
    }

    @Post('screenshot/guess')
    @HttpCode(HttpStatus.OK)
    @UseGuards(OptionalJwtAuthGuard)
    @ApiOperation({ summary: 'Submit an anime guess for the screenshot game' })
    async submitGuessScreenshot(
        @Body('animeId') animeId: number,
        @Body('gameNumber') rawGn: any,
        @Req() req: any,
    ) {
        const gameNumber = this.parseGameNumber(rawGn);
        const userId = req.user?.id;
        return this.gamesService.compareGuessScreenshot(animeId, userId, gameNumber);
    }
}

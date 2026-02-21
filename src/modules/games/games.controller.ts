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

    @Get('anime/daily')
    @ApiOperation({ summary: "Get today's anime game metadata" })
    @ApiResponse({ status: 200, description: 'Game metadata retrieved successfully' })
    async getDailyMetadata() {
        const gameNumber = this.gamesService.getGameNumber();
        return {
            gameNumber,
            title: `Guess the Anime #${gameNumber}`,
        };
    }

    @Get('anime/state')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: "Get user's daily game state including current streak" })
    async getGameState(@CurrentUser() user: CurrentUserData) {
        return this.gamesService.getFullGameState(user.id);
    }

    @Get('anime/hint')
    @UseGuards(OptionalJwtAuthGuard)
    @ApiOperation({ summary: 'Get a hint for the daily anime' })
    @ApiResponse({ status: 200, description: 'Hint retrieved successfully' })
    async getHint(@Query('attempts') attempts: number, @Req() req: any) {
        const userId = req.user?.id;
        const safeAttempts = await this.gamesService.resolveAttempts(attempts, userId, 'anime');
        return this.gamesService.getHint(safeAttempts);
    }

    @Post('anime/guess')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Submit an anime guess' })
    @ApiResponse({ status: 200, description: 'Guess comparison result' })
    async submitGuess(
        @Body('animeId') animeId: number,
        @Req() req: any,
    ) {
        const userId = req.user?.id;
        return this.gamesService.compareGuess(animeId, userId);
    }

    // ─── Jeux-Vidéo Guess Game ───────────────────────────────────────────────

    @Get('jeux/daily')
    @ApiOperation({ summary: "Get today's jeux-vidéo game metadata" })
    async getDailyMetadataJeux() {
        const gameNumber = this.gamesService.getGameNumber();
        return { gameNumber, title: `Ani-Kun Guess Jeux #${gameNumber}` };
    }

    @Get('jeux/state')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: "Get user's daily jeux game state" })
    async getGameStateJeux(@CurrentUser() user: CurrentUserData) {
        return this.gamesService.getFullGameStateJeux(user.id);
    }

    @Get('jeux/hint')
    @UseGuards(OptionalJwtAuthGuard)
    @ApiOperation({ summary: 'Get a hint for the daily jeu' })
    async getHintJeux(@Query('attempts') attempts: number, @Req() req: any) {
        const userId = req.user?.id;
        const safeAttempts = await this.gamesService.resolveAttempts(attempts, userId, 'jeux');
        return this.gamesService.getHintJeux(safeAttempts);
    }

    @Post('jeux/guess')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Submit a jeu-vidéo guess' })
    async submitGuessJeux(
        @Body('jeuId') jeuId: number,
        @Req() req: any,
    ) {
        const userId = req.user?.id;
        return this.gamesService.compareGuessJeux(jeuId, userId);
    }
}

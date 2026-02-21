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
    @ApiOperation({ summary: 'Get a hint for the daily anime' })
    @ApiResponse({ status: 200, description: 'Hint retrieved successfully' })
    async getHint(@Query('attempts') attempts: number) {
        return this.gamesService.getHint(attempts);
    }

    @Post('anime/guess')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Submit an anime guess' })
    @ApiResponse({ status: 200, description: 'Guess comparison result' })
    async submitGuess(
        @Body('animeId') animeId: number,
        @Req() req: any,
    ) {
        // If user is authenticated, passport-jwt will put 'user' on req even if guard didn't block
        // (Assuming JwtAuthGuard is globally applied or used elsewhere to populate req.user,
        // but here it's safer to just check if repo.user exists if we want it optional).
        // For simple implementation, let's just use useGuards if we want it strictly for logged in users
        // but we want both. So we check if user is in request.
        const userId = req.user?.id;
        return this.gamesService.compareGuess(animeId, userId);
    }
}

import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody } from '@nestjs/swagger';
import { IgdbService } from '../../shared/services/igdb.service';

@ApiTags('IGDB')
@Controller('igdb')
export class IgdbController {
  constructor(private readonly igdbService: IgdbService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search games on IGDB' })
  @ApiQuery({ name: 'q', description: 'Search query', required: true })
  @ApiQuery({ name: 'limit', description: 'Result limit', required: false })
  @ApiResponse({ status: 200, description: 'Search results from IGDB' })
  async search(
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    if (!query) {
      throw new BadRequestException('Search query is required');
    }

    const parsedLimit = limit ? parseInt(limit) : 10;
    const games = await this.igdbService.searchGames(query, parsedLimit);

    // Transform IGDB format to match MediaSelector expectations
    return games.map(game => ({
      id: game.id,
      externalId: game.id,
      title: game.name,
      mediaType: 'game',
      source: 'igdb',
      image: game.cover?.image_id
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`
        : null,
      year: game.first_release_date
        ? new Date(game.first_release_date * 1000).getFullYear()
        : null,
      summary: game.summary,
      platforms: game.platforms?.map(p => p.name).join(', '),
      genres: game.genres?.map(g => g.name).join(', '),
    }));
  }

  @Post('import')
  @ApiOperation({ summary: 'Import a game from IGDB to local database' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        igdbId: { type: 'number', description: 'IGDB game ID' },
      },
      required: ['igdbId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Game imported successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async import(@Body('igdbId', ParseIntPipe) igdbId: number) {
    if (!igdbId) {
      throw new BadRequestException('IGDB ID is required');
    }

    const game = await this.igdbService.importGame(igdbId);
    return game;
  }
}

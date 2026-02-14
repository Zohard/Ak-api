import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  ParseIntPipe,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { IgdbService } from '../../shared/services/igdb.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('IGDB')
@Controller('igdb')
export class IgdbController {
  constructor(private readonly igdbService: IgdbService) { }

  @Get('search')
  @ApiOperation({ summary: 'Search games on IGDB' })
  @ApiQuery({ name: 'q', description: 'Search query', required: true })
  @ApiQuery({ name: 'limit', description: 'Result limit', required: false })
  @ApiResponse({ status: 200, description: 'Search results from IGDB' })
  async search(
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    console.log('[IGDB Controller] Received query:', query, 'limit:', limit);

    if (!query) {
      throw new BadRequestException('Search query is required');
    }

    const parsedLimit = limit ? parseInt(limit) : 10;
    console.log('[IGDB Controller] Calling searchGames with query:', query, 'limit:', parsedLimit);
    const games = await this.igdbService.searchGames(query, parsedLimit);
    console.log('[IGDB Controller] Received games:', games.length);

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

  @Get('releases/:year/:month')
  @ApiOperation({ summary: 'Get games released in a specific month' })
  @ApiQuery({ name: 'limit', description: 'Result limit', required: false })
  @ApiQuery({ name: 'offset', description: 'Offset for pagination', required: false })
  @ApiResponse({ status: 200, description: 'Games released in the specified month' })
  async getByReleaseMonth(
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (month < 1 || month > 12) {
      throw new BadRequestException('Month must be between 1 and 12');
    }

    const parsedLimit = limit ? parseInt(limit) : 50;
    const parsedOffset = offset ? parseInt(offset) : 0;

    const games = await this.igdbService.getGamesByReleaseMonth(
      year,
      month,
      parsedLimit,
      parsedOffset
    );

    // Transform IGDB format
    return games.map(game => ({
      id: game.id,
      externalId: game.id,
      title: game.name,
      mediaType: 'game',
      source: 'igdb',
      image: game.cover?.image_id
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`
        : null,
      releaseDate: game.first_release_date
        ? new Date(game.first_release_date * 1000).toISOString()
        : null,
      year: game.first_release_date
        ? new Date(game.first_release_date * 1000).getFullYear()
        : null,
      summary: game.summary,
      platforms: game.platforms?.map(p => p.name).join(', '),
      genres: game.genres?.map(g => g.name).join(', '),
      developers: game.involved_companies
        ?.filter(c => c.developer)
        ?.map(c => c.company.name)
        .join(', '),
      publishers: game.involved_companies
        ?.filter(c => c.publisher)
        ?.map(c => c.company.name)
        .join(', '),
    }));
  }

  @Post('import/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Import a game from IGDB to local database' })
  @ApiResponse({ status: 201, description: 'Game imported successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async import(@Param('id', ParseIntPipe) igdbId: number) {
    const game = await this.igdbService.importGame(igdbId);
    return {
      id: game.idJeu,
      titre: game.titre,
      image: game.image,
      annee: game.annee,
    };
  }
}

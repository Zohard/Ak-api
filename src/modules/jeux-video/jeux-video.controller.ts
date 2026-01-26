import { Controller, Get, Param, ParseIntPipe, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JeuxVideoService } from './jeux-video.service';
import { JeuVideoQueryDto } from './dto/jeu-video-query.dto';

@ApiTags('Jeux Vidéo')
@Controller('jeux-video')
export class JeuxVideoController {
  constructor(private readonly jeuxVideoService: JeuxVideoService) { }

  @Get()
  @ApiOperation({ summary: 'Liste des jeux vidéo avec pagination et filtres' })
  @ApiResponse({ status: 200, description: 'Liste des jeux vidéo' })
  async findAll(@Query() query: JeuVideoQueryDto) {
    return this.jeuxVideoService.findAll(query);
  }

  @Get('autocomplete')
  @ApiOperation({ summary: 'Recherche autocomplete pour jeux vidéo' })
  @ApiResponse({ status: 200, description: "Résultats de l'autocomplete" })
  async autocomplete(
    @Query('q') query: string,
    @Query('exclude') exclude?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit) : 10;
    return this.jeuxVideoService.autocomplete(query, exclude, parsedLimit);
  }

  @Get('planning')
  @ApiOperation({ summary: 'Planning des sorties jeux vidéo par mois' })
  @ApiResponse({ status: 200, description: 'Liste des jeux sortant sur la période donnée' })
  async getPlanning(
    @Query('year') year: string, // NestJS Query params are strings by default unless transformed
    @Query('month') month: string,
  ) {
    if (!year || !month) {
      // Default to current month if not provided? Or throw error?
      // Let's mirror usual behavior or default to current.
      const now = new Date();
      return this.jeuxVideoService.getPlanning(
        year ? parseInt(year) : now.getFullYear(),
        month ? parseInt(month) : now.getMonth() + 1
      );
    }
    return this.jeuxVideoService.getPlanning(parseInt(year), parseInt(month));
  }

  @Get('bulk')
  @ApiOperation({ summary: 'Récupérer plusieurs jeux vidéo par IDs (bulk fetch)' })
  @ApiResponse({ status: 200, description: 'Liste des jeux vidéo' })
  @ApiResponse({ status: 400, description: 'IDs invalides' })
  async findByIds(@Query('ids') ids: string) {
    if (!ids) {
      throw new BadRequestException('Required query parameter ids is missing');
    }
    const idArray = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    if (idArray.length === 0) {
      throw new BadRequestException('No valid IDs provided');
    }
    return this.jeuxVideoService.findByIds(idArray);
  }

  @Get('platforms')
  @ApiOperation({ summary: 'Liste des plateformes disponibles' })
  @ApiResponse({ status: 200, description: 'Liste des plateformes' })
  async getPlatforms() {
    return this.jeuxVideoService.getPlatforms();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un jeu vidéo par ID' })
  @ApiParam({ name: 'id', description: 'ID du jeu vidéo' })
  @ApiResponse({ status: 200, description: 'Jeu vidéo trouvé' })
  @ApiResponse({ status: 404, description: 'Jeu vidéo introuvable' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.jeuxVideoService.findOne(id);
  }

  @Get(':id/genres')
  @ApiOperation({ summary: 'Obtenir les genres d\'un jeu vidéo' })
  @ApiParam({ name: 'id', description: 'ID du jeu vidéo' })
  @ApiResponse({ status: 200, description: 'Genres du jeu vidéo' })
  @ApiResponse({ status: 404, description: 'Jeu vidéo introuvable' })
  async getGenres(@Param('id', ParseIntPipe) id: number) {
    return this.jeuxVideoService.getGenres(id);
  }

  @Get(':id/relationships')
  @ApiOperation({ summary: 'Get relationships for a video game' })
  @ApiParam({ name: 'id', description: 'ID du jeu vidéo' })
  @ApiResponse({ status: 200, description: 'Relations retrieved successfully' })
  async getRelationships(@Param('id', ParseIntPipe) id: number) {
    return this.jeuxVideoService.getRelationships(id);
  }

  @Get(':id/similar')
  @ApiOperation({ summary: 'Get similar video games' })
  @ApiParam({ name: 'id', description: 'ID du jeu vidéo' })
  @ApiResponse({ status: 200, description: 'Similar games retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Jeu vidéo introuvable' })
  async getSimilarGames(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit) : 6;
    return this.jeuxVideoService.getSimilarGames(id, parsedLimit);
  }
}

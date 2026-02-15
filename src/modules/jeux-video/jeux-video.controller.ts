import { Controller, Get, Param, ParseIntPipe, Query, BadRequestException, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JeuxVideoService } from './jeux-video.service';
import { JeuVideoQueryDto } from './dto/jeu-video-query.dto';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';

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
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Recherche autocomplete pour jeux vidéo' })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Terme de recherche',
  })
  @ApiQuery({
    name: 'exclude',
    required: false,
    description: 'IDs à exclure (séparés par virgules)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Nombre maximum de résultats',
  })
  @ApiQuery({
    name: 'notInCollection',
    required: false,
    description: 'Exclure les jeux déjà dans la collection de l\'utilisateur',
    type: Boolean,
  })
  @ApiResponse({ status: 200, description: "Résultats de l'autocomplete" })
  async autocomplete(
    @Query('q') query: string,
    @Query('exclude') exclude?: string,
    @Query('limit') limit?: string,
    @Query('notInCollection') notInCollection?: string,
    @Request() req?: any,
  ) {
    const parsedLimit = limit ? parseInt(limit) : 10;
    const userId = req?.user?.sub || req?.user?.id;
    const shouldExcludeCollection = notInCollection === 'true' && userId;

    console.log('[JeuxVideo Autocomplete] notInCollection param:', notInCollection);
    console.log('[JeuxVideo Autocomplete] User from request:', req?.user);
    console.log('[JeuxVideo Autocomplete] userId extracted:', userId);
    console.log('[JeuxVideo Autocomplete] shouldExcludeCollection:', shouldExcludeCollection);

    return this.jeuxVideoService.autocomplete(
      query,
      exclude,
      parsedLimit,
      shouldExcludeCollection ? userId : undefined,
    );
  }

  @Get('planning')
  @ApiOperation({ summary: 'Planning des sorties jeux vidéo par mois' })
  @ApiQuery({ name: 'year', required: false, description: 'Année' })
  @ApiQuery({ name: 'month', required: false, description: 'Mois (1-12)' })
  @ApiQuery({ name: 'inCollection', required: false, description: 'Filtrer par ma collection (true/false)' })
  @ApiQuery({ name: 'genreIds', required: false, description: 'IDs des genres (séparés par virgule)' })
  @ApiQuery({ name: 'platformIds', required: false, description: 'IDs des plateformes (séparés par virgule)' })
  @ApiResponse({ status: 200, description: 'Liste des jeux sortant sur la période donnée' })
  async getPlanning(
    @Request() req,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('inCollection') inCollection?: string,
    @Query('genreIds') genreIds?: string,
    @Query('platformIds') platformIds?: string,
  ) {
    const now = new Date();
    const parsedYear = year ? parseInt(year) : now.getFullYear();
    const parsedMonth = month ? parseInt(month) : now.getMonth() + 1;

    // Parse filters
    const userId = inCollection === 'true' && req.user?.sub ? req.user.sub : undefined;
    const parsedGenreIds = genreIds ? genreIds.split(',').map(id => parseInt(id)).filter(id => !isNaN(id)) : undefined;
    const parsedPlatformIds = platformIds ? platformIds.split(',').map(id => parseInt(id)).filter(id => !isNaN(id)) : undefined;

    return this.jeuxVideoService.getPlanning(parsedYear, parsedMonth, {
      userId,
      genreIds: parsedGenreIds,
      platformIds: parsedPlatformIds,
    });
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

  @Get('genres')
  @ApiOperation({ summary: 'Liste des genres disponibles' })
  @ApiResponse({ status: 200, description: 'Liste des genres' })
  async getAllGenres() {
    return this.jeuxVideoService.getAllGenres();
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

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AnimesService } from './animes.service';
import { CreateAnimeDto } from './dto/create-anime.dto';
import { UpdateAnimeDto } from './dto/update-anime.dto';
import { AnimeQueryDto } from './dto/anime-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('Animes')
@Controller('animes')
export class AnimesController {
  constructor(private readonly animesService: AnimesService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des animes avec pagination et filtres' })
  @ApiResponse({ status: 200, description: 'Liste des animes' })
  async findAll(@Query() query: AnimeQueryDto) {
    return this.animesService.findAll(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un nouvel anime' })
  @ApiResponse({ status: 201, description: 'Anime créé avec succès' })
  @ApiResponse({ status: 401, description: 'Authentification requise' })
  async create(@Body() createAnimeDto: CreateAnimeDto, @Request() req) {
    return this.animesService.create(createAnimeDto, req.user.id);
  }

  @Get('top')
  @ApiOperation({ summary: 'Top animes les mieux notés' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: "Nombre d'animes à retourner",
    example: 10,
  })
  @ApiResponse({ status: 200, description: 'Liste des meilleurs animes' })
  async getTopAnimes(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit) : 10;
    return this.animesService.getTopAnimes(parsedLimit);
  }

  @Get('random')
  @ApiOperation({ summary: 'Anime aléatoire' })
  @ApiResponse({ status: 200, description: 'Anime aléatoire' })
  @ApiResponse({ status: 404, description: 'Aucun anime disponible' })
  async getRandomAnime() {
    return this.animesService.getRandomAnime();
  }

  @Get('genres')
  @ApiOperation({ summary: 'Liste de tous les genres disponibles' })
  @ApiResponse({ status: 200, description: 'Liste des genres' })
  async getGenres() {
    return this.animesService.getGenres();
  }

  @Get('popular-tags')
  @ApiOperation({ summary: 'Tags les plus populaires pour les animes' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Nombre de tags à retourner',
    example: 20,
  })
  @ApiResponse({ status: 200, description: 'Liste des tags les plus populaires' })
  async getMostPopularAnimeTags(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit) : 20;
    return this.animesService.getMostPopularAnimeTags(parsedLimit);
  }

  @Get('genre/:genre')
  @ApiOperation({ summary: 'Animes par genre' })
  @ApiParam({ name: 'genre', description: 'Nom du genre', example: 'action' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: "Nombre d'animes à retourner",
    example: 20,
  })
  @ApiResponse({ status: 200, description: 'Animes du genre spécifié' })
  async getAnimesByGenre(
    @Param('genre') genre: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit) : 20;
    return this.animesService.getAnimesByGenre(genre, parsedLimit);
  }

  @Get('autocomplete')
  @ApiOperation({ summary: 'Recherche autocomplete pour animes' })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Terme de recherche',
    example: 'naruto',
  })
  @ApiQuery({
    name: 'exclude',
    required: false,
    description: 'IDs à exclure (séparés par virgules)',
    example: '1,2,3',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Nombre maximum de résultats',
    example: 10,
  })
  @ApiResponse({ status: 200, description: "Résultats de l'autocomplete" })
  @ApiResponse({ status: 400, description: 'Requête invalide' })
  async autocomplete(
    @Query('q') query: string,
    @Query('exclude') exclude?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit) : 10;
    return this.animesService.autocomplete(query, exclude, parsedLimit);
  }

  @Get(':id/tags')
  @ApiOperation({ summary: 'Tags pour un anime spécifique' })
  @ApiParam({ name: 'id', description: "ID de l'anime", type: 'number' })
  @ApiResponse({ status: 200, description: 'Liste des tags' })
  @ApiResponse({ status: 404, description: 'Anime introuvable' })
  async getAnimeTags(@Param('id', ParseIntPipe) id: number) {
    return this.animesService.getAnimeTags(id);
  }

  @Get(':id/relations')
  @ApiOperation({ summary: 'Relations pour un anime spécifique' })
  @ApiParam({ name: 'id', description: "ID de l'anime", type: 'number' })
  @ApiResponse({ status: 200, description: 'Liste des relations' })
  @ApiResponse({ status: 404, description: 'Anime introuvable' })
  async getAnimeRelations(@Param('id', ParseIntPipe) id: number) {
    try {
      return await this.animesService.getAnimeRelations(id);
    } catch (error) {
      console.error('Controller error in getAnimeRelations:', error);
      throw error;
    }
  }

  @Get(':id/staff')
  @ApiOperation({ summary: 'Staff et équipe technique pour un anime spécifique' })
  @ApiParam({ name: 'id', description: "ID de l'anime", type: 'number' })
  @ApiResponse({ status: 200, description: 'Liste du staff' })
  @ApiResponse({ status: 404, description: 'Anime introuvable' })
  async getAnimeStaff(@Param('id', ParseIntPipe) id: number) {
    return this.animesService.getAnimeStaff(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un anime par ID' })
  @ApiParam({ name: 'id', description: "ID de l'anime", type: 'number' })
  @ApiQuery({
    name: 'includeReviews',
    required: false,
    description: 'Inclure les critiques',
    example: false,
  })
  @ApiQuery({
    name: 'includeEpisodes',
    required: false,
    description: 'Inclure les épisodes',
    example: false,
  })
  @ApiResponse({ status: 200, description: "Détails de l'anime" })
  @ApiResponse({ status: 404, description: 'Anime introuvable' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('includeReviews') includeReviews = false,
    @Query('includeEpisodes') includeEpisodes = false,
  ) {
    return this.animesService.findOne(id, includeReviews, includeEpisodes);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour un anime' })
  @ApiParam({ name: 'id', description: "ID de l'anime", type: 'number' })
  @ApiResponse({ status: 200, description: 'Anime mis à jour avec succès' })
  @ApiResponse({ status: 401, description: 'Authentification requise' })
  @ApiResponse({ status: 403, description: 'Droits insuffisants' })
  @ApiResponse({ status: 404, description: 'Anime introuvable' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateAnimeDto: UpdateAnimeDto,
    @Request() req,
  ) {
    return this.animesService.update(
      id,
      updateAnimeDto,
      req.user.id,
      req.user.isAdmin,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un anime (Admin seulement)' })
  @ApiParam({ name: 'id', description: "ID de l'anime", type: 'number' })
  @ApiResponse({ status: 204, description: 'Anime supprimé avec succès' })
  @ApiResponse({ status: 401, description: 'Authentification requise' })
  @ApiResponse({ status: 403, description: "Droits d'administrateur requis" })
  @ApiResponse({ status: 404, description: 'Anime introuvable' })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.animesService.remove(id, req.user.id, req.user.isAdmin);
  }
}

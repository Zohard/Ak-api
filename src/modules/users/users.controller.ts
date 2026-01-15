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
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { RecommendationsQueryDto } from './dto/recommendations-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }
  private readonly logger = new Logger(UsersController.name);

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Liste des utilisateurs (avec pagination et recherche)',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des utilisateurs avec pagination',
  })
  async findAll(@Query() query: UserQueryDto) {
    return this.usersService.findAll(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un nouvel utilisateur (Admin seulement)' })
  @ApiResponse({ status: 201, description: 'Utilisateur créé avec succès' })
  @ApiResponse({ status: 403, description: 'Accès refusé - Admin requis' })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Récupérer le profil de l'utilisateur connecté" })
  @ApiResponse({ status: 200, description: "Profil de l'utilisateur connecté" })
  async getProfile(@Request() req) {
    return this.usersService.findOne(req.user.id);
  }

  @Get('activity-check')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Vérifier l'activité de l'utilisateur connecté" })
  @ApiResponse({
    status: 200,
    description: "État de l'activité de l'utilisateur (collections, messages forum)"
  })
  async checkUserActivity(@Request() req) {
    return this.usersService.checkUserActivity(req.user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Mettre à jour le profil de l'utilisateur connecté",
  })
  @ApiResponse({ status: 200, description: 'Profil mis à jour avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  async updateProfile(
    @Request() req,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.update(
      req.user.id,
      updateProfileDto,
      req.user.id,
      req.user.isAdmin,
    );
  }

  @Get('birthdays')
  @ApiOperation({ summary: 'Récupérer les anniversaires des utilisateurs par mois' })
  @ApiQuery({ name: 'month', required: true, description: 'Mois (1-12)', example: 1 })
  @ApiQuery({ name: 'year', required: true, description: 'Année', example: 2025 })
  @ApiResponse({ status: 200, description: 'Liste des anniversaires du mois' })
  @ApiResponse({ status: 400, description: 'Paramètres invalides' })
  async getUserBirthdays(
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.usersService.getUserBirthdays(month, year);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer un utilisateur par ID' })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur", type: 'number' })
  @ApiResponse({ status: 200, description: "Données de l'utilisateur" })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mettre à jour un utilisateur (Admin ou propriétaire seulement)',
  })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur", type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Utilisateur mis à jour avec succès',
  })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProfileDto: UpdateProfileDto,
    @Request() req,
  ) {
    return this.usersService.update(
      id,
      updateProfileDto,
      req.user.id,
      req.user.isAdmin,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprimer un utilisateur (Admin ou propriétaire seulement)',
  })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur", type: 'number' })
  @ApiResponse({ status: 204, description: 'Utilisateur supprimé avec succès' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.usersService.remove(id, req.user.id, req.user.isAdmin);
  }

  @Get(':id/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Statistiques détaillées d'un utilisateur" })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur", type: 'number' })
  @ApiResponse({ status: 200, description: "Statistiques de l'utilisateur" })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async getUserStats(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.getUserStats(id);
  }

  @Get(':id/activity')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Activité récente d'un utilisateur" })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur", type: 'number' })
  @ApiResponse({ status: 200, description: "Activité récente de l'utilisateur" })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async getUserActivity(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getUserActivity(id, limit || 10);
  }

  // Specific recommendation endpoints MUST come before generic :media route
  @Get(':id/recommendations/anime')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Recommandations d'anime pour un utilisateur" })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur", type: 'number' })
  @ApiResponse({ status: 200, description: "Recommandations d'anime" })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async getUserAnimeRecommendations(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: RecommendationsQueryDto,
  ) {
    const genresParam = query.genres || query.genre;
    return this.usersService.getUserAnimeRecommendations(
      id,
      query.limit || 12,
      query.page || 1,
      genresParam,
      query.sortBy,
      query.similarTo,
      query.similarToType as 'anime' | 'manga',
      query.tags
    );
  }

  @Get(':id/recommendations/manga')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Recommandations de manga pour un utilisateur" })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur", type: 'number' })
  @ApiResponse({ status: 200, description: "Recommandations de manga" })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async getUserMangaRecommendations(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: RecommendationsQueryDto,
  ) {
    const genresParam = query.genres || query.genre;
    return this.usersService.getUserMangaRecommendations(
      id,
      query.limit || 12,
      query.page || 1,
      genresParam,
      query.sortBy,
      query.similarTo,
      query.similarToType as 'anime' | 'manga',
      query.tags
    );
  }

  @Get(':id/recommendations/games')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Recommandations de jeux vidéo pour un utilisateur" })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur", type: 'number' })
  @ApiResponse({ status: 200, description: "Recommandations de jeux vidéo" })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async getUserGameRecommendations(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: RecommendationsQueryDto,
  ) {
    return this.usersService.getUserGameRecommendations(
      id,
      query.limit || 12,
      query.page || 1,
      query.sortBy,
      query.similarTo,
      query.genres
    );
  }

  @Get(':id/recommendations/:media')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Recommandations personnalisées par type pour un utilisateur" })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur", type: 'number' })
  @ApiParam({ name: 'media', description: 'Type de contenu', enum: ['anime', 'manga'] })
  @ApiQuery({ name: 'genre', required: false, description: 'Filtrer par genre (deprecated, use genres)' })
  @ApiQuery({ name: 'genres', required: false, description: 'Filtrer par genres (séparés par virgule)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Trier par (rating, popularity, date, title)' })
  @ApiQuery({ name: 'similarTo', required: false, description: 'ID du média similaire', type: 'number' })
  @ApiQuery({ name: 'similarToType', required: false, description: 'Type du média similaire', enum: ['anime', 'manga'] })
  @ApiQuery({ name: 'tags', required: false, description: 'Tags séparés par virgule pour inclure tous les tags' })
  @ApiResponse({ status: 200, description: "Recommandations personnalisées (filtrées)" })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async getUserRecommendationsByMedia(
    @Param('id', ParseIntPipe) id: number,
    @Param('media') media: 'anime' | 'manga',
    @Query('limit', ParseIntPipe) limit?: number,
    @Query('offset', ParseIntPipe) offset?: number,
    @Query('genre') genre?: string,
    @Query('genres') genres?: string,
    @Query('sortBy') sortBy?: string,
    @Query('similarTo') similarTo?: number,
    @Query('similarToType') similarToType?: 'anime' | 'manga',
    @Query('tags') tags?: string,
  ) {
    // Support both 'genre' and 'genres' parameters for backward compatibility
    const genresParam = genres || genre;

    this.logger.debug('📊 Media-specific recommendations request:', {
      userId: id,
      media,
      limit: limit || 12,
      offset: offset || 0,
      genres: genresParam,
      sortBy,
      similarTo,
      similarToType,
      tags
    });

    const requestedLimit = limit || 12;
    const effectiveOffset = offset || 0;
    const page = Math.floor(effectiveOffset / requestedLimit) + 1;

    // Fetch more items to ensure we have enough after filtering
    const fetchLimit = requestedLimit * 3;
    const result = await this.usersService.getUserRecommendations(
      id,
      fetchLimit,
      page,
      genresParam,
      sortBy,
      similarTo,
      similarToType,
      tags
    );

    // Filter by media type and take only the requested limit
    const filtered = result.items.filter((item: any) => item.type === media);
    const limitedItems = filtered.slice(0, requestedLimit);

    return {
      ...result,
      items: limitedItems,
      total: filtered.length,
      hasMore: filtered.length > requestedLimit
    };
  }

  @Get(':id/recommendations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Recommandations personnalisées pour un utilisateur" })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur", type: 'number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Nombre de recommandations', example: 12 })
  @ApiQuery({ name: 'page', required: false, description: 'Numéro de page', example: 1 })
  @ApiQuery({ name: 'genre', required: false, description: 'Filtrer par genre (deprecated, use genres)' })
  @ApiQuery({ name: 'genres', required: false, description: 'Filtrer par genres (séparés par virgule)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Trier par (rating, popularity, date, title)' })
  @ApiQuery({ name: 'similarTo', required: false, description: 'ID du média similaire', type: 'number' })
  @ApiQuery({ name: 'similarToType', required: false, description: 'Type du média similaire', enum: ['anime', 'manga'] })
  @ApiQuery({ name: 'tags', required: false, description: 'Tags séparés par virgule pour inclure tous les tags' })
  @ApiResponse({ status: 200, description: "Recommandations personnalisées" })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async getUserRecommendations(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: number,
    @Query('page') page?: number,
    @Query('genre') genre?: string,
    @Query('genres') genres?: string,
    @Query('sortBy') sortBy?: string,
    @Query('similarTo') similarTo?: number,
    @Query('similarToType') similarToType?: 'anime' | 'manga',
    @Query('tags') tags?: string,
  ) {
    // Support both 'genre' and 'genres' parameters for backward compatibility
    const genresParam = genres || genre;

    this.logger.debug('📊 Recommendations request:', {
      userId: id,
      limit: limit || 12,
      page: page || 1,
      genres: genresParam,
      sortBy,
      similarTo,
      similarToType,
      tags
    });

    return this.usersService.getUserRecommendations(
      id,
      limit || 12,
      page || 1,
      genresParam,
      sortBy,
      similarTo,
      similarToType,
      tags
    );
  }

  // Public endpoints (no authentication required)
  @Get('by-username/:username')
  @ApiOperation({ summary: 'Récupérer un utilisateur par username (memberName ou realName)' })
  @ApiParam({ name: 'username', description: 'Username de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Données de l\'utilisateur' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async getUserByUsername(@Param('username') username: string) {
    return this.usersService.findPublicByPseudo(username);
  }

  @Get('public/:pseudo')
  @ApiOperation({ summary: 'Récupérer le profil public d\'un utilisateur par pseudo' })
  @ApiParam({ name: 'pseudo', description: 'Pseudo de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Profil public de l\'utilisateur' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async getPublicProfile(@Param('pseudo') pseudo: string) {
    return this.usersService.findPublicByPseudo(pseudo);
  }

  @Get('public/:pseudo/stats')
  @ApiOperation({ summary: 'Statistiques publiques d\'un utilisateur' })
  @ApiParam({ name: 'pseudo', description: 'Pseudo de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Statistiques publiques' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async getPublicUserStats(@Param('pseudo') pseudo: string) {
    return this.usersService.getPublicUserStats(pseudo);
  }

  @Get('public/:pseudo/reviews')
  @ApiOperation({ summary: 'Critiques publiques d\'un utilisateur' })
  @ApiParam({ name: 'pseudo', description: 'Pseudo de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Liste des critiques publiques' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async getPublicUserReviews(
    @Param('pseudo') pseudo: string,
    @Query('limit') limit?: number,
    @Query('page') page?: number,
    @Query('type') type?: 'anime' | 'manga' | 'game' | 'all',
    @Query('sort') sort?: 'recent' | 'rating_desc' | 'rating_asc' | 'views',
    @Query('search') search?: string,
  ) {
    return this.usersService.getPublicUserReviews(pseudo, {
      limit: limit || 12,
      page: page || 1,
      type: type || 'all',
      sort: sort || 'recent',
      search: search || ''
    });
  }

  @Get('public/:pseudo/activity')
  @ApiOperation({ summary: 'Activité publique d\'un utilisateur' })
  @ApiParam({ name: 'pseudo', description: 'Pseudo de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Activité publique récente' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable' })
  async getPublicUserActivity(
    @Param('pseudo') pseudo: string,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getPublicUserActivity(pseudo, limit || 10);
  }
}

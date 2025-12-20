import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
  Request,
  HttpCode,
  HttpStatus,
  Res,
  Patch,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CollectionsService } from './collections.service';
import { AddAnimeToCollectionDto } from './dto/add-anime-to-collection.dto';
import { AddMangaToCollectionDto } from './dto/add-manga-to-collection.dto';
import { AddToCollectionDto } from './dto/add-to-collection.dto';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { CollectionQueryDto } from './dto/collection-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ImportMalDto } from './dto/import-mal.dto';
import { AddJeuxVideoToCollectionDto } from './dto/add-jeuxvideo-to-collection.dto';
import { UpdateJeuxVideoCollectionDto } from './dto/update-jeuxvideo-collection.dto';
import type { Response } from 'express';

@ApiTags('collections')
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer une nouvelle collection' })
  @ApiResponse({ status: 201, description: 'Collection créée avec succès' })
  @ApiResponse({ status: 401, description: 'Authentification requise' })
  async createCollection(
    @Body() createCollectionDto: CreateCollectionDto,
    @Request() req,
  ) {
    return this.collectionsService.createCollection(
      req.user.id,
      createCollectionDto,
    );
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer mes collections' })
  @ApiResponse({ status: 200, description: 'Liste des collections utilisateur' })
  async getMyCollections(@Query() query: CollectionQueryDto, @Request() req) {
    return this.collectionsService.getUserCollections(req.user.id, query);
  }

  @Post('add')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ajouter un anime/manga à une collection' })
  @ApiResponse({ status: 201, description: 'Ajouté à la collection avec succès' })
  @ApiResponse({ status: 404, description: 'Média non trouvé' })
  @ApiResponse({ status: 409, description: 'Déjà dans la collection' })
  async addToCollection(
    @Body() addToCollectionDto: AddToCollectionDto,
    @Request() req,
  ) {
    return this.collectionsService.addToCollection(
      req.user.id,
      addToCollectionDto,
    );
  }

  @Patch('update-rating')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour la note d\'un anime/manga dans la collection' })
  @ApiResponse({ status: 200, description: 'Note mise à jour avec succès' })
  @ApiResponse({ status: 404, description: 'Média non trouvé dans la collection' })
  async updateRating(
    @Body() body: { mediaId: number; mediaType: 'anime' | 'manga' | 'jeu-video'; rating: number },
    @Request() req,
  ) {
    return this.collectionsService.updateRating(
      req.user.id,
      body.mediaId,
      body.mediaType === 'jeu-video' ? 'game' : body.mediaType,
      body.rating,
    );
  }

  @Get('items')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer les éléments de mes collections' })
  @ApiQuery({
    name: 'mediaType',
    required: false,
    enum: ['anime', 'manga'],
    description: 'Filtrer par type de média',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['watching', 'completed', 'on-hold', 'dropped', 'plan-to-watch'],
    description: 'Filtrer par type de collection',
  })
  @ApiResponse({ status: 200, description: 'Liste des éléments de collection' })
  async getCollectionItems(@Query() query: CollectionQueryDto, @Request() req) {
    return this.collectionsService.getCollectionItems(req.user.id, query);
  }

  @Delete('remove/:mediaType/:mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retirer un anime/manga de toutes mes collections' })
  @ApiParam({
    name: 'mediaType',
    enum: ['anime', 'manga'],
    description: 'Type de média',
  })
  @ApiParam({
    name: 'mediaId',
    type: 'number',
    description: 'ID du média',
  })
  @ApiResponse({ status: 204, description: 'Retiré de la collection' })
  @ApiResponse({ status: 404, description: 'Média non trouvé dans les collections' })
  async removeFromCollection(
    @Param('mediaType') mediaType: 'anime' | 'manga',
    @Param('mediaId', ParseIntPipe) mediaId: number,
    @Request() req,
  ) {
    return this.collectionsService.removeFromCollection(
      req.user.id,
      mediaId,
      mediaType,
    );
  }

  @Get('check/:mediaType/:mediaId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vérifier si un anime/manga/jeu vidéo est dans mes collections' })
  @ApiParam({
    name: 'mediaType',
    enum: ['anime', 'manga', 'jeu-video'],
    description: 'Type de média',
  })
  @ApiParam({
    name: 'mediaId',
    type: 'number',
    description: 'ID du média',
  })
  @ApiResponse({ status: 200, description: 'Statut de présence dans les collections' })
  async checkInCollection(
    @Param('mediaType') mediaType: 'anime' | 'manga' | 'jeu-video',
    @Param('mediaId', ParseIntPipe) mediaId: number,
    @Request() req,
  ) {
    console.log(`🔍 [checkInCollection] Controller received - user: ${JSON.stringify(req.user)}, mediaType: ${mediaType}, mediaId: ${mediaId}`);
    return this.collectionsService.isInCollection(
      req.user.id,
      mediaId,
      mediaType,
    );
  }

  @Post('import/mal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import MAL list (client-parsed XML as JSON)' })
  @ApiResponse({ status: 200, description: 'Import processed with summary' })
  async importFromMal(@Body() body: ImportMalDto, @Request() req) {
    return this.collectionsService.importFromMAL(req.user.id, body.items || []);
  }

  @Get('export/mal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export collections in MAL XML format' })
  @ApiQuery({ name: 'mediaType', required: false, enum: ['anime', 'manga'], description: 'Type of media to export. Default: anime' })
  @ApiResponse({ status: 200, description: 'MAL XML exported' })
  async exportToMal(
    @Query('mediaType') mediaType: 'anime' | 'manga' = 'anime',
    @Request() req,
    @Res() res: Response,
  ) {
    const xml = await this.collectionsService.exportToMAL(req.user.id, mediaType);
    const ts = Math.floor(Date.now() / 1000);
    const filename = `${mediaType === 'anime' ? 'animelist' : 'mangalist'}_${ts}_-_${req.user.id}.xml`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  }

  @Get()
  @ApiOperation({ summary: 'Get user collections by userId' })
  @ApiResponse({ status: 200, description: 'Collections retrieved successfully' })
  @ApiQuery({ name: 'userId', required: true, type: Number, description: 'User ID' })
  findUserCollections(@Query('userId', ParseIntPipe) userId: number, @Request() req) {
    const currentUserId = req.user?.id;
    return this.collectionsService.findUserCollections(userId, currentUserId);
  }

  @Get('browse')
  @ApiOperation({ summary: 'Browse all users with public collections' })
  @ApiResponse({ status: 200, description: 'User collections retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by username' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Sort by field' })
  browseUserCollections(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('search') search: string = '',
    @Query('sortBy') sortBy: string = '',
    @Request() req,
  ) {
    const currentUserId = req.user?.id;
    return this.collectionsService.browseUserCollections(
      parseInt(page),
      parseInt(limit),
      search || undefined,
      sortBy || undefined,
      currentUserId,
    );
  }

  @Get('user/:userId/info')
  @ApiOperation({ summary: 'Get user info with collection summary (optimized single-user endpoint)' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User info with collections retrieved successfully' })
  getUserInfo(
    @Param('userId', ParseIntPipe) userId: number,
    @Request() req
  ) {
    const currentUserId = req.user?.id;
    return this.collectionsService.getUserInfo(userId, currentUserId);
  }

  @Get('user/:userId/summary')
  @ApiOperation({ summary: 'Get collection summary (counts per type) for a user' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Collection summary retrieved successfully' })
  getCollectionSummary(
    @Param('userId', ParseIntPipe) userId: number,
    @Request() req
  ) {
    const currentUserId = req.user?.id;
    return this.collectionsService.getCollectionSummary(userId, currentUserId);
  }

  @Get('user/:userId/type/:type')
  @ApiOperation({ summary: 'Get collection details by user and type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (1-4)' })
  @ApiResponse({ status: 200, description: 'Collection retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  findCollectionByType(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Request() req
  ) {
    const currentUserId = req.user?.id;
    return this.collectionsService.findCollectionByType(userId, type, currentUserId);
  }

  // Anime collection routes
  @Get('user/:userId/type/:type/animes')
  @ApiOperation({ summary: 'Get animes from user collection by type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (1-4)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Collection animes retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  getCollectionAnimes(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Request() req,
  ) {
    const currentUserId = req.user?.id;
    return this.collectionsService.getCollectionAnimes(userId, type, parseInt(page), parseInt(limit), currentUserId);
  }

  @Post('user/:userId/type/:type/animes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add anime to user collection by type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (1-4)' })
  @ApiResponse({ status: 201, description: 'Anime added to collection successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your collection' })
  @ApiResponse({ status: 404, description: 'Anime not found' })
  @ApiResponse({ status: 409, description: 'Anime already in collection' })
  addAnimeToCollection(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Body() addAnimeDto: AddAnimeToCollectionDto,
    @Request() req,
  ) {
    return this.collectionsService.addAnimeToCollection(userId, type, addAnimeDto, req.user.id);
  }

  @Delete('user/:userId/type/:type/animes/:animeId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove anime from user collection by type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (1-4)' })
  @ApiParam({ name: 'animeId', type: 'number', description: 'Anime ID' })
  @ApiResponse({ status: 200, description: 'Anime removed from collection successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your collection' })
  @ApiResponse({ status: 404, description: 'Anime not found in collection' })
  removeAnimeFromCollection(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Param('animeId', ParseIntPipe) animeId: number,
    @Request() req,
  ) {
    return this.collectionsService.removeAnimeFromCollection(userId, type, animeId, req.user.id);
  }

  // Manga collection routes
  @Get('user/:userId/type/:type/mangas')
  @ApiOperation({ summary: 'Get mangas from user collection by type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (1-4)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Collection mangas retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  getCollectionMangas(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Request() req,
  ) {
    const currentUserId = req.user?.id;
    return this.collectionsService.getCollectionMangas(userId, type, parseInt(page), parseInt(limit), currentUserId);
  }

  @Post('user/:userId/type/:type/mangas')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add manga to user collection by type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (1-4)' })
  @ApiResponse({ status: 201, description: 'Manga added to collection successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your collection' })
  @ApiResponse({ status: 404, description: 'Manga not found' })
  @ApiResponse({ status: 409, description: 'Manga already in collection' })
  addMangaToCollection(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Body() addMangaDto: AddMangaToCollectionDto,
    @Request() req,
  ) {
    return this.collectionsService.addMangaToCollection(userId, type, addMangaDto, req.user.id);
  }

  @Delete('user/:userId/type/:type/mangas/:mangaId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove manga from user collection by type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (1-4)' })
  @ApiParam({ name: 'mangaId', type: 'number', description: 'Manga ID' })
  @ApiResponse({ status: 200, description: 'Manga removed from collection successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your collection' })
  @ApiResponse({ status: 404, description: 'Manga not found in collection' })
  removeMangaFromCollection(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Param('mangaId', ParseIntPipe) mangaId: number,
    @Request() req,
  ) {
    return this.collectionsService.removeMangaFromCollection(userId, type, mangaId, req.user.id);
  }

  // Ratings distribution (for charts)
  @Get('user/:userId/type/:type/animes/ratings')
  @ApiOperation({ summary: 'Get ratings distribution for animes in a user collection type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (0-4). 0 = all types' })
  @ApiResponse({ status: 200, description: 'Ratings distribution computed successfully' })
  getAnimeRatingsDistribution(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Request() req,
  ) {
    const currentUserId = req.user?.id;
    return this.collectionsService.getRatingsDistribution(userId, type, 'anime', currentUserId);
  }

  @Get('user/:userId/type/:type/mangas/ratings')
  @ApiOperation({ summary: 'Get ratings distribution for mangas in a user collection type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (0-4). 0 = all types' })
  @ApiResponse({ status: 200, description: 'Ratings distribution computed successfully' })
  getMangaRatingsDistribution(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Request() req,
  ) {
    const currentUserId = req.user?.id;
    return this.collectionsService.getRatingsDistribution(userId, type, 'manga', currentUserId);
  }

  // Video Game Collection Endpoints
  @Post('users/:userId/jeuxvideo/:type')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a video game to user collection' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: '1=Terminé, 2=En cours, 3=Planifié, 4=Abandonné, 5=En pause' })
  @ApiResponse({ status: 201, description: 'Game added to collection successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your collection' })
  @ApiResponse({ status: 404, description: 'Game not found' })
  @ApiResponse({ status: 409, description: 'Game already in this collection type' })
  addJeuxVideoToCollection(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Body() dto: AddJeuxVideoToCollectionDto,
    @Request() req,
  ) {
    const currentUserId = req.user?.id;
    return this.collectionsService.addJeuxVideoToCollection(userId, type, dto, currentUserId);
  }

  @Patch('users/:userId/jeuxvideo/entry/:collectionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a video game collection entry' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'collectionId', type: 'number', description: 'Collection entry ID' })
  @ApiResponse({ status: 200, description: 'Collection entry updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your collection' })
  @ApiResponse({ status: 404, description: 'Collection entry not found' })
  updateJeuxVideoInCollection(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Body() dto: UpdateJeuxVideoCollectionDto,
    @Request() req,
  ) {
    const currentUserId = req.user?.id;

    // Debug logging
    console.log('Controller - updateJeuxVideoInCollection:', {
      userId,
      userIdType: typeof userId,
      collectionId,
      currentUserId,
      currentUserIdType: typeof currentUserId,
      reqUser: req.user,
      dto
    });

    return this.collectionsService.updateJeuxVideoInCollection(userId, collectionId, dto, currentUserId);
  }

  @Delete('users/:userId/jeuxvideo/entry/:collectionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a video game from collection' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'collectionId', type: 'number', description: 'Collection entry ID' })
  @ApiResponse({ status: 200, description: 'Game removed from collection successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your collection' })
  @ApiResponse({ status: 404, description: 'Collection entry not found' })
  removeJeuxVideoFromCollection(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('collectionId', ParseIntPipe) collectionId: number,
    @Request() req,
  ) {
    const currentUserId = req.user?.id;
    return this.collectionsService.removeJeuxVideoFromCollection(userId, collectionId, currentUserId);
  }

  @Get('users/:userId/jeuxvideo')
  @ApiOperation({ summary: 'Get user video game collection' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiQuery({ name: 'type', required: false, type: 'number', description: 'Collection type filter (1-5)' })
  @ApiQuery({ name: 'page', required: false, type: 'number', description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: 'number', description: 'Items per page (default: 20)' })
  @ApiResponse({ status: 200, description: 'Video game collection retrieved successfully' })
  getJeuxVideoCollection(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('type', new ParseIntPipe({ optional: true })) type: number | undefined,
    @Query('page', new ParseIntPipe({ optional: true })) page: number | undefined,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number | undefined,
    @Request() req,
  ) {
    const currentUserId = req.user?.id;
    return this.collectionsService.getJeuxVideoCollection(userId, type, currentUserId, page, limit);
  }
}

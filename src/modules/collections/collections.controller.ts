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
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
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
import { MalImportJobData } from './processors/import.processor';
import type { Response } from 'express';
import { VideoGameCollectionService } from './services/video-game-collection.service';
import { CollectionStatisticsService } from './services/collection-statistics.service';
import { CollectionImportService } from './services/collection-import.service';
import { CollectionBrowseService } from './services/collection-browse.service';

@ApiTags('collections')
@Controller('collections')
export class CollectionsController {
  private readonly logger = new Logger(CollectionsController.name);
  constructor(
    private readonly collectionsService: CollectionsService,
    @InjectQueue('import-queue') private readonly importQueue: Queue<MalImportJobData>,
    private readonly videoGameCollectionService: VideoGameCollectionService,
    private readonly collectionStatisticsService: CollectionStatisticsService,
    private readonly collectionImportService: CollectionImportService,
    private readonly collectionBrowseService: CollectionBrowseService,
  ) { }

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
    // Determine which service to call based on what getUserCollections was doing
    // It seems getMyCollections was fetching "virtual" collections (counts per type)
    // This logic was moved to CollectionBrowseService (findUserCollections) or kept in CollectionsService?
    // Let's check the original code: getUserCollections called getUserCollectionsFromDB
    // which returns a list of collection types with counts.
    // This logic seems similar to findUserCollections but for the current user.
    // Wait, original CollectionsService had getUserCollections AND findUserCollections.
    // getUserCollections returned paginated list of collection types.
    // findUserCollections returned all collection types.
    // I moved findUserCollections to CollectionBrowseService.
    // Did I move getUserCollections?
    // getUserCollections logic was: fetch counts, build types list.
    // This belongs to CollectionStatisticsService? Or Browse?
    // Use CollectionBrowseService.findUserCollections for now as it seems to cover the same ground.
    // Actually, getUserCollections was somewhat redundant.
    // Let's us CollectionsService.getUserCollections if I kept it there, or check where I moved it.
    // I didn't explicitly move getUserCollections in my plan, but I moved findUserCollections.
    // I'll keep getUserCollections in CollectionsService for now if I didn't move it, OR map it to CollectionBrowseService.
    // Let's assume I keep it in CollectionsService as it was main entry point.
    // Checking my plan: "Retained Methods: ... getCollectionItems". getUserCollections wasn't explicitly mentioned.
    // But I moved "CollectionBrowseService: findUserCollections".
    // Let's check the code: getUserCollections (lines 38-62) called getUserCollectionsFromDB.
    // I should probably move getUserCollections to CollectionBrowseService too as it's browsing own collections.
    // But since I didn't create it in CollectionBrowseService yet, I'll rely on CollectionsService for this specific one,
    // OR realize that findUserCollections is the same thing.
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
    this.logger.debug(`🔍 [checkInCollection] Controller received - user: ${JSON.stringify(req.user)}, mediaType: ${mediaType}, mediaId: ${mediaId}`);
    return this.collectionsService.isInCollection(
      req.user.id,
      mediaId,
      mediaType,
    );
  }

  @Post('check/bulk')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vérifier la présence de multiples médias dans les collections' })
  @ApiResponse({ status: 200, description: 'Statut de présence pour chaque média' })
  async checkBulkInCollection(
    @Body() body: { mediaType: 'anime' | 'manga', mediaIds: number[] },
    @Request() req,
  ) {
    return this.collectionsService.checkBulkInCollection(
      req.user.id,
      body.mediaType,
      body.mediaIds,
    );
  }

  @Get('check-nocache/:mediaType/:mediaId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[DEBUG] Vérifier collection sans cache' })
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
  @ApiResponse({ status: 200, description: 'Statut de présence (direct DB query)' })
  async checkInCollectionNoCache(
    @Param('mediaType') mediaType: 'anime' | 'manga' | 'jeu-video',
    @Param('mediaId', ParseIntPipe) mediaId: number,
    @Request() req,
  ) {
    this.logger.debug(`🔍 [checkInCollectionNoCache] NOCACHE query - userId: ${req.user.id}, mediaType: ${mediaType}, mediaId: ${mediaId}`);

    // Bypass cache and query database directly
    let collections: any[] = [];
    if (mediaType === 'anime') {
      collections = await this.collectionsService['prisma'].$queryRaw<any[]>`
        SELECT type, evaluation, notes, NULL as id_collection
        FROM collection_animes
        WHERE id_membre = ${req.user.id} AND id_anime = ${mediaId}
      `;
    } else if (mediaType === 'manga') {
      collections = await this.collectionsService['prisma'].$queryRaw<any[]>`
        SELECT type, evaluation, notes, NULL as id_collection
        FROM collection_mangas
        WHERE id_membre = ${req.user.id} AND id_manga = ${mediaId}
      `;
    }

    this.logger.debug(`🔍 [checkInCollectionNoCache] Direct SQL returned ${collections.length} rows: ${JSON.stringify(collections)}`);

    return {
      debug: true,
      userId: req.user.id,
      mediaType,
      mediaId,
      inCollection: collections.length > 0,
      collections,
      rawCollections: collections
    };
  }

  @Post('import/mal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import MAL list (client-parsed XML as JSON) - queued for background processing' })
  @ApiResponse({ status: 202, description: 'Import queued for background processing' })
  @HttpCode(HttpStatus.ACCEPTED)
  async importFromMal(@Body() body: ImportMalDto, @Request() req) {
    const items = body.items || [];

    if (!items.length) {
      return {
        success: false,
        queued: false,
        message: 'No items to import',
      };
    }

    // Get user email and username for the notification
    const userEmail = req.user.email || '';
    const username = req.user.username || 'Utilisateur';

    try {
      // Add job to queue
      const job = await this.importQueue.add(
        'import-mal',
        {
          userId: req.user.id,
          userEmail,
          username,
          items,
        } as MalImportJobData,
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: {
            age: 3600, // Keep completed jobs for 1 hour
            count: 100,
          },
          removeOnFail: {
            age: 86400, // Keep failed jobs for 24 hours
          },
        }
      );

      this.logger.log(`MAL import job ${job.id} queued for user ${req.user.id} with ${items.length} items`);

      return {
        success: true,
        queued: true,
        jobId: job.id,
        itemCount: items.length,
        message: `Import de ${items.length} éléments en cours de traitement. Vous recevrez un email lorsque l'import sera terminé.`,
      };
    } catch (error) {
      // Handle Redis/Upstash limit errors gracefully
      if (error.message?.includes('max requests limit exceeded') || error.message?.includes('ERR max')) {
        this.logger.error(`Redis limit reached, cannot queue import: ${error.message}`);
        return {
          success: false,
          queued: false,
          error: 'queue_limit_exceeded',
          message: 'Le service de file d\'attente est temporairement indisponible. Veuillez réessayer plus tard.',
        };
      }
      throw error;
    }
  }

  @Get('import/status/:jobId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get import job status' })
  @ApiParam({ name: 'jobId', description: 'Job ID returned from import/mal endpoint' })
  @ApiResponse({ status: 200, description: 'Job status' })
  async getImportStatus(@Param('jobId') jobId: string, @Request() req) {
    let job;
    try {
      job = await this.importQueue.getJob(jobId);
    } catch (error) {
      // Handle Redis/Upstash limit errors gracefully
      if (error.message?.includes('max requests limit exceeded') || error.message?.includes('ERR max')) {
        this.logger.error(`Redis limit reached, cannot check job status: ${error.message}`);
        return {
          found: false,
          status: 'unavailable',
          error: 'queue_limit_exceeded',
          message: 'Le service de file d\'attente est temporairement indisponible.',
        };
      }
      throw error;
    }

    if (!job) {
      return {
        found: false,
        status: 'not_found',
        message: 'Job not found or already completed and removed',
      };
    }

    // Security: verify the job belongs to this user
    if (job.data.userId !== req.user.id) {
      return {
        found: false,
        status: 'not_found',
        message: 'Job not found',
      };
    }

    const state = await job.getState();
    const progress = job.progress || 0;

    // Get result if completed
    let result = null;
    if (state === 'completed') {
      result = job.returnvalue;
    }

    // Get failure reason if failed
    let failedReason = null;
    if (state === 'failed') {
      failedReason = job.failedReason;
    }

    return {
      found: true,
      jobId: job.id,
      status: state,
      progress: typeof progress === 'number' ? progress : (progress as any)?.percentage || 0,
      processedCount: typeof progress === 'object' ? (progress as any)?.processed || 0 : 0,
      totalCount: job.data.items?.length || 0,
      result,
      failedReason,
      createdAt: job.timestamp,
      processedAt: job.processedOn,
      finishedAt: job.finishedOn,
    };
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
    const xml = await this.collectionImportService.exportToMAL(req.user.id, mediaType);
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
    return this.collectionBrowseService.findUserCollections(userId, currentUserId);
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
    return this.collectionBrowseService.browseUserCollections(
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
    return this.collectionStatisticsService.getUserInfo(userId, currentUserId);
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
    return this.collectionStatisticsService.getCollectionSummary(userId, currentUserId);
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
    return this.collectionBrowseService.findCollectionByType(userId, type, currentUserId);
  }

  // Anime collection routes
  @Get('user/:userId/type/:type/animes')
  @ApiOperation({ summary: 'Get animes from user collection by type' })
  @ApiParam({ name: 'userId', type: 'number', description: 'User ID' })
  @ApiParam({ name: 'type', type: 'number', description: 'Collection type (1-4)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'Filter by anime year' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Sort by field (createdAt, rating, title, updatedAt, notes)' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], description: 'Sort order' })
  @ApiResponse({ status: 200, description: 'Collection animes retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  getCollectionAnimes(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('year', new ParseIntPipe({ optional: true })) year: number | undefined,
    @Query('sortBy') sortBy: string | undefined,
    @Query('sortOrder') sortOrder: 'asc' | 'desc' | undefined,
    @Request() req,
  ) {
    const currentUserId = req.user?.id;
    // Note: getCollectionAnimes is still in CollectionsService as it returns ITEMS
    return this.collectionsService.getCollectionAnimes(userId, type, parseInt(page), parseInt(limit), currentUserId, year, sortBy, sortOrder);
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
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'Filter by manga year' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Sort by field (createdAt, rating, title, updatedAt, notes)' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], description: 'Sort order' })
  @ApiResponse({ status: 200, description: 'Collection mangas retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  getCollectionMangas(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', ParseIntPipe) type: number,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('year', new ParseIntPipe({ optional: true })) year: number | undefined,
    @Query('sortBy') sortBy: string | undefined,
    @Query('sortOrder') sortOrder: 'asc' | 'desc' | undefined,
    @Request() req,
  ) {
    const currentUserId = req.user?.id;
    return this.collectionsService.getCollectionMangas(userId, type, parseInt(page), parseInt(limit), currentUserId, year, sortBy, sortOrder);
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
    return this.collectionStatisticsService.getRatingsDistribution(userId, type, 'anime', currentUserId);
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
    return this.collectionStatisticsService.getRatingsDistribution(userId, type, 'manga', currentUserId);
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
    return this.videoGameCollectionService.addJeuxVideoToCollection(userId, type, dto, currentUserId);
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
    this.logger.debug('Controller - updateJeuxVideoInCollection:', {
      userId,
      userIdType: typeof userId,
      collectionId,
      currentUserId,
      currentUserIdType: typeof currentUserId,
      reqUser: req.user,
      dto
    });

    return this.videoGameCollectionService.updateJeuxVideoInCollection(userId, collectionId, dto, currentUserId);
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
    return this.videoGameCollectionService.removeJeuxVideoFromCollection(userId, collectionId, currentUserId);
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
    @Query('year', new ParseIntPipe({ optional: true })) year: number | undefined,
    @Query('sortBy') sortBy: string | undefined,
    @Query('sortOrder') sortOrder: 'asc' | 'desc' | undefined,
    @Request() req,
  ) {
    const currentUserId = req.user?.id;
    return this.videoGameCollectionService.getJeuxVideoCollection(userId, type, currentUserId, page, limit, year, sortBy, sortOrder);
  }

  @Get('media/:mediaType/:mediaId/users')
  @ApiOperation({ summary: 'Get users who have this anime/manga in their collection with their evaluations' })
  @ApiParam({ name: 'mediaType', enum: ['anime', 'manga'], description: 'Type of media' })
  @ApiParam({ name: 'mediaId', type: 'number', description: 'Media ID' })
  @ApiQuery({ name: 'page', required: false, type: 'number', description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: 'number', description: 'Items per page (default: 20)' })
  @ApiQuery({ name: 'friendsOnly', required: false, type: 'boolean', description: 'Show only friends (default: false)' })
  @ApiResponse({ status: 200, description: 'Users with collections retrieved successfully' })
  getUsersWithMedia(
    @Param('mediaType') mediaType: 'anime' | 'manga',
    @Param('mediaId', ParseIntPipe) mediaId: number,
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 20,
    @Query('friendsOnly') friendsOnly: string = 'false',
    @Request() req,
  ) {
    const currentUserId = req.user?.id;
    const friendsOnlyBool = friendsOnly === 'true';
    return this.collectionBrowseService.getUsersWithMedia(mediaType, mediaId, page, limit, currentUserId, friendsOnlyBool);
  }
}

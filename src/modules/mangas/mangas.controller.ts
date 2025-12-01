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
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { MangasService } from './mangas.service';
import { GoogleBooksService } from './google-books.service';
import { CreateMangaDto } from './dto/create-manga.dto';
import { UpdateMangaDto } from './dto/update-manga.dto';
import { MangaQueryDto } from './dto/manga-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImageKitService } from '../media/imagekit.service';

@ApiTags('Mangas')
@Controller('mangas')
export class MangasController {
  constructor(
    private readonly mangasService: MangasService,
    private readonly imageKitService: ImageKitService,
    private readonly googleBooksService: GoogleBooksService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liste des mangas avec pagination et filtres' })
  @ApiResponse({ status: 200, description: 'Liste des mangas' })
  async findAll(@Query() query: MangaQueryDto) {
    return this.mangasService.findAll(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un nouveau manga' })
  @ApiResponse({ status: 201, description: 'Manga créé avec succès' })
  async create(@Body() createMangaDto: CreateMangaDto, @Request() req) {
    return this.mangasService.create(createMangaDto, req.user.id);
  }

  @Get('top')
  @ApiOperation({ summary: 'Top mangas les mieux notés' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: "Nombre de mangas à retourner",
    example: 10,
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Type de classement (reviews-based only)',
    example: 'reviews-bayes',
    enum: ['reviews-bayes', 'reviews-avg'],
  })
  @ApiResponse({ status: 200, description: 'Liste des meilleurs mangas' })
  async getTopMangas(
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit) : 10;
    const rankingType = type || 'reviews-bayes';
    return this.mangasService.getTopMangas(parsedLimit, rankingType);
  }

  @Get('flop')
  @ApiOperation({ summary: 'Flop mangas les moins bien notés' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: "Nombre de mangas à retourner",
    example: 20,
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Type de classement (reviews-based only)',
    example: 'reviews-bayes',
    enum: ['reviews-bayes', 'reviews-avg'],
  })
  @ApiResponse({ status: 200, description: 'Liste des pires mangas' })
  async getFlopMangas(
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit) : 20;
    const rankingType = type || 'reviews-bayes';
    return this.mangasService.getFlopMangas(parsedLimit, rankingType);
  }

  @Get('random')
  @ApiOperation({ summary: 'Manga aléatoire' })
  @ApiResponse({ status: 200, description: 'Manga aléatoire' })
  @ApiResponse({ status: 404, description: 'Aucun manga disponible' })
  async getRandomManga() {
    return this.mangasService.getRandomManga();
  }

  @Get('genres')
  @ApiOperation({ summary: 'Liste de tous les genres disponibles' })
  @ApiResponse({ status: 200, description: 'Liste des genres' })
  async getGenres() {
    return this.mangasService.getGenres();
  }

  @Get('popular-tags')
  @ApiOperation({ summary: 'Tags les plus populaires pour les mangas' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Nombre de tags à retourner',
    example: 20,
  })
  @ApiResponse({ status: 200, description: 'Liste des tags les plus populaires' })
  async getMostPopularMangaTags(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit) : 20;
    return this.mangasService.getMostPopularMangaTags(parsedLimit);
  }

  @Get('most-popular-tags')
  @ApiOperation({ summary: 'Tags les plus populaires pour les mangas (alias)' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Nombre de tags à retourner',
    example: 20,
  })
  @ApiResponse({ status: 200, description: 'Liste des tags les plus populaires' })
  async getMostPopularMangaTagsAlias(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit) : 20;
    return this.mangasService.getMostPopularMangaTags(parsedLimit);
  }

  @Get('genre/:genre')
  @ApiOperation({ summary: 'Mangas par genre' })
  @ApiParam({ name: 'genre', description: 'Nom du genre', example: 'action' })
  @ApiResponse({ status: 200, description: 'Mangas du genre spécifié' })
  async getMangasByGenre(
    @Param('genre') genre: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit) : 20;
    return this.mangasService.getMangasByGenre(genre, parsedLimit);
  }

  @Get('autocomplete')
  @ApiOperation({ summary: 'Recherche autocomplete pour mangas' })
  @ApiResponse({ status: 200, description: "Résultats de l'autocomplete" })
  async autocomplete(
    @Query('q') query: string,
    @Query('exclude') exclude?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit) : 10;
    return this.mangasService.autocomplete(query, exclude, parsedLimit);
  }

  @Get('bulk')
  @ApiOperation({ summary: 'Récupérer plusieurs mangas par IDs (bulk fetch)' })
  @ApiQuery({
    name: 'ids',
    required: true,
    description: 'IDs des mangas (séparés par virgules)',
    example: '1,2,3,4,5',
  })
  @ApiResponse({ status: 200, description: 'Liste des mangas' })
  @ApiResponse({ status: 400, description: 'IDs invalides' })
  async findByIds(@Query('ids') ids: string) {
    const idArray = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    if (idArray.length === 0) {
      throw new BadRequestException('No valid IDs provided');
    }
    return this.mangasService.findByIds(idArray);
  }

  @Get('anilist/search')
  @ApiOperation({ summary: 'Recherche mangas sur AniList' })
  @ApiQuery({ name: 'q', required: true, description: 'Terme de recherche', example: 'one piece' })
  @ApiQuery({ name: 'limit', required: false, description: 'Nombre maximum de résultats', example: 10 })
  @ApiResponse({ status: 200, description: 'Résultats de la recherche AniList' })
  async searchAniList(
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit) : 10;
    return this.mangasService.searchAniList(query, parsedLimit);
  }

  @Get('anilist/daterange/:startDate/:endDate')
  @ApiOperation({ summary: 'Récupérer mangas par période de temps depuis AniList' })
  @ApiParam({ name: 'startDate', description: 'Date de début (YYYY-MM-DD)', example: '2024-01-01' })
  @ApiParam({ name: 'endDate', description: 'Date de fin (YYYY-MM-DD)', example: '2024-04-30' })
  @ApiQuery({ name: 'limit', required: false, description: 'Nombre maximum de résultats', example: 200 })
  @ApiResponse({ status: 200, description: 'Mangas de la période spécifiée avec comparaison à la base de données' })
  async getMangasByDateRange(
    @Param('startDate') startDate: string,
    @Param('endDate') endDate: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit) : 200;
    return this.mangasService.getMangasByDateRange(startDate, endDate, parsedLimit);
  }

  @Get('googlebooks/month/:year/:month')
  @ApiOperation({ summary: 'Récupérer dernières parutions manga en France via Google Books par mois' })
  @ApiParam({ name: 'year', description: 'Année', example: 2024 })
  @ApiParam({ name: 'month', description: 'Mois (1-12)', example: 1 })
  @ApiQuery({ name: 'maxResults', required: false, description: 'Nombre maximum de résultats', example: 40 })
  @ApiResponse({ status: 200, description: 'Mangas trouvés sur Google Books' })
  async getMangasByGoogleBooks(
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @Query('maxResults') maxResults?: string,
  ) {
    const parsedMaxResults = maxResults ? parseInt(maxResults) : 40;
    return this.googleBooksService.searchMangaByMonth(year, month, parsedMaxResults);
  }

  @Get('isbn/lookup')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Lookup manga by ISBN barcode' })
  @ApiQuery({ name: 'isbn', required: true, description: 'ISBN barcode number', example: '9784088820750' })
  @ApiResponse({ status: 200, description: 'Manga information from ISBN lookup' })
  @ApiResponse({ status: 400, description: 'Invalid ISBN or book not found' })
  @ApiResponse({ status: 404, description: 'No matching manga found on AniList' })
  async lookupByIsbn(@Query('isbn') isbn: string, @Request() req) {
    if (!isbn) {
      throw new BadRequestException('ISBN parameter is required');
    }
    const userId = req.user?.id;
    return this.mangasService.lookupByIsbn(isbn, userId);
  }

  @Get(':id/tags')
  @ApiOperation({ summary: 'Tags pour un manga spécifique' })
  @ApiParam({ name: 'id', description: 'ID du manga', type: 'number' })
  @ApiResponse({ status: 200, description: 'Liste des tags' })
  @ApiResponse({ status: 404, description: 'Manga introuvable' })
  async getMangaTags(@Param('id', ParseIntPipe) id: number) {
    return this.mangasService.getMangaTags(id);
  }

  @Get(':id/relations')
  @ApiOperation({ summary: 'Relations pour un manga spécifique' })
  @ApiParam({ name: 'id', description: 'ID du manga', type: 'number' })
  @ApiResponse({ status: 200, description: 'Liste des relations' })
  @ApiResponse({ status: 404, description: 'Manga introuvable' })
  async getMangaRelations(@Param('id', ParseIntPipe) id: number) {
    return this.mangasService.getMangaRelations(id);
  }

  @Get(':id/articles')
  @ApiOperation({ summary: 'Articles webzine liés à un manga' })
  @ApiParam({ name: 'id', description: 'ID du manga', type: 'number' })
  @ApiResponse({ status: 200, description: 'Liste des articles' })
  @ApiResponse({ status: 404, description: 'Manga introuvable' })
  async getMangaArticles(@Param('id', ParseIntPipe) id: number) {
    try {
      return await this.mangasService.getMangaArticles(id);
    } catch (error) {
      console.error('Controller error in getMangaArticles:', error);
      throw error;
    }
  }

  @Get(':id/staff')
  @ApiOperation({ summary: 'Staff et équipe technique pour un manga spécifique' })
  @ApiParam({ name: 'id', description: 'ID du manga', type: 'number' })
  @ApiResponse({ status: 200, description: 'Liste du staff' })
  @ApiResponse({ status: 404, description: 'Manga introuvable' })
  async getMangaStaff(@Param('id', ParseIntPipe) id: number) {
    return this.mangasService.getMangaStaff(id);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Récupérer un manga par ID' })
  @ApiParam({ name: 'id', description: 'ID du manga', type: 'number' })
  @ApiResponse({ status: 200, description: 'Détails du manga' })
  @ApiResponse({ status: 404, description: 'Manga introuvable' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('includeReviews') includeReviews = false,
    @Request() req?,
  ) {
    return this.mangasService.findOne(id, includeReviews, req?.user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour un manga' })
  @ApiParam({ name: 'id', description: 'ID du manga', type: 'number' })
  @ApiResponse({ status: 200, description: 'Manga mis à jour avec succès' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMangaDto: UpdateMangaDto,
    @Request() req,
  ) {
    return this.mangasService.update(
      id,
      updateMangaDto,
      req.user.id,
      req.user.isAdmin,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un manga (Admin seulement)' })
  @ApiParam({ name: 'id', description: 'ID du manga', type: 'number' })
  @ApiResponse({ status: 204, description: 'Manga supprimé avec succès' })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.mangasService.remove(id, req.user.id, req.user.isAdmin);
  }

  @Post(':id/upload-image')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload cover image to ImageKit and set it (Admin)' })
  @ApiResponse({ status: 200, description: 'Image uploaded and manga updated' })
  async uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const folder = '/images/mangas';
    const result = await this.imageKitService.uploadImage(
      file.buffer,
      file.originalname,
      folder,
    );

    // Update manga image with the ImageKit URL
    const updated = await this.mangasService.update(
      id,
      { image: result.url } as UpdateMangaDto,
      req.user.id,
      true,
    );

    return { message: 'Image uploaded', url: result.url, manga: updated };
  }

  // ===== Business Relationships Management =====

  @Get(':id/businesses')
  @ApiOperation({ summary: "Récupérer les relations business d'un manga" })
  @ApiParam({ name: 'id', description: 'ID du manga', type: 'number' })
  @ApiResponse({ status: 200, description: "Liste des relations business du manga" })
  @ApiResponse({ status: 404, description: 'Manga introuvable' })
  async getMangaBusinesses(@Param('id', ParseIntPipe) id: number) {
    return this.mangasService.getMangaBusinesses(id);
  }

  @Post(':id/businesses')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Ajouter une relation business à un manga (Admin seulement)" })
  @ApiParam({ name: 'id', description: 'ID du manga', type: 'number' })
  @ApiResponse({ status: 201, description: 'Relation business créée avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Authentification requise' })
  @ApiResponse({ status: 403, description: "Droits d'administrateur requis" })
  @ApiResponse({ status: 404, description: 'Manga ou business introuvable' })
  async addMangaBusiness(
    @Param('id', ParseIntPipe) mangaId: number,
    @Body() body: { businessId: number; type: string; precisions?: string },
  ) {
    return this.mangasService.addMangaBusiness(
      mangaId,
      body.businessId,
      body.type,
      body.precisions,
    );
  }

  @Delete(':id/businesses/:businessId')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Supprimer une relation business d'un manga (Admin seulement)" })
  @ApiParam({ name: 'id', description: 'ID du manga', type: 'number' })
  @ApiParam({ name: 'businessId', description: 'ID du business', type: 'number' })
  @ApiResponse({ status: 204, description: 'Relation business supprimée avec succès' })
  @ApiResponse({ status: 401, description: 'Authentification requise' })
  @ApiResponse({ status: 403, description: "Droits d'administrateur requis" })
  @ApiResponse({ status: 404, description: 'Relation business introuvable' })
  async removeMangaBusiness(
    @Param('id', ParseIntPipe) mangaId: number,
    @Param('businessId', ParseIntPipe) businessId: number,
  ) {
    return this.mangasService.removeMangaBusiness(mangaId, businessId);
  }

  // ==================== MANGA VOLUMES ENDPOINTS ====================

  @Get(':id/volumes')
  @ApiOperation({ summary: 'Get all volumes for a manga' })
  @ApiParam({ name: 'id', description: 'Manga ID' })
  @ApiResponse({ status: 200, description: 'Returns all volumes' })
  @ApiResponse({ status: 404, description: 'Manga not found' })
  async getMangaVolumes(@Param('id', ParseIntPipe) mangaId: number) {
    return this.mangasService.getMangaVolumes(mangaId);
  }

  @Get('volumes/:volumeId')
  @ApiOperation({ summary: 'Get a specific volume by ID' })
  @ApiParam({ name: 'volumeId', description: 'Volume ID' })
  @ApiResponse({ status: 200, description: 'Returns the volume' })
  @ApiResponse({ status: 404, description: 'Volume not found' })
  async getVolume(@Param('volumeId', ParseIntPipe) volumeId: number) {
    return this.mangasService.getVolume(volumeId);
  }

  @Get('volumes/isbn/:isbn')
  @ApiOperation({ summary: 'Get volume by ISBN' })
  @ApiParam({ name: 'isbn', description: 'ISBN-13' })
  @ApiResponse({ status: 200, description: 'Returns the volume' })
  @ApiResponse({ status: 404, description: 'Volume not found' })
  async getVolumeByIsbn(@Param('isbn') isbn: string) {
    return this.mangasService.getVolumeByIsbn(isbn);
  }

  @Post(':id/volumes')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new volume for a manga' })
  @ApiParam({ name: 'id', description: 'Manga ID' })
  @ApiResponse({ status: 201, description: 'Volume created' })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  @ApiResponse({ status: 404, description: 'Manga not found' })
  async createVolume(
    @Param('id', ParseIntPipe) mangaId: number,
    @Body() createVolumeDto: any,
  ) {
    return this.mangasService.createVolume(mangaId, createVolumeDto);
  }

  @Patch('volumes/:volumeId')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a volume' })
  @ApiParam({ name: 'volumeId', description: 'Volume ID' })
  @ApiResponse({ status: 200, description: 'Volume updated' })
  @ApiResponse({ status: 404, description: 'Volume not found' })
  async updateVolume(
    @Param('volumeId', ParseIntPipe) volumeId: number,
    @Body() updateVolumeDto: any,
  ) {
    return this.mangasService.updateVolume(volumeId, updateVolumeDto);
  }

  @Delete('volumes/:volumeId')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a volume' })
  @ApiParam({ name: 'volumeId', description: 'Volume ID' })
  @ApiResponse({ status: 200, description: 'Volume deleted' })
  @ApiResponse({ status: 404, description: 'Volume not found' })
  async deleteVolume(@Param('volumeId', ParseIntPipe) volumeId: number) {
    return this.mangasService.deleteVolume(volumeId);
  }

  @Post(':id/volumes/scan')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add volume from ISBN scan' })
  @ApiParam({ name: 'id', description: 'Manga ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        isbn: { type: 'string', example: '9782756078519' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Volume created from scan' })
  @ApiResponse({ status: 400, description: 'Invalid ISBN' })
  async scanVolumeIsbn(
    @Param('id', ParseIntPipe) mangaId: number,
    @Body('isbn') isbn: string,
  ) {
    // Lookup book data from Google Books or OpenLibrary
    const bookData = await this.mangasService.lookupByIsbn(isbn);

    // Create volume with the book data
    return this.mangasService.upsertVolumeFromIsbn(mangaId, isbn, bookData);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
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
} from '@nestjs/swagger';
import { BusinessService } from './business.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { BusinessQueryDto } from './dto/business-query.dto';
import { BusinessSearchDto } from './dto/business-search.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImageKitService } from '../media/imagekit.service';
import { AniListService } from '../anilist/anilist.service';

@ApiTags('Business')
@Controller('business')
export class BusinessController {
  constructor(
    private readonly businessService: BusinessService,
    private readonly imageKitService: ImageKitService,
    private readonly aniListService: AniListService,
  ) {}

  @Get('search')
  @ApiOperation({
    summary: "Recherche d'entités business (pas d'auth requise)",
    description:
      'Endpoint public pour rechercher des entités business par dénomination',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Terme de recherche',
    example: 'pierrot',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Nombre maximum de résultats',
    example: 10,
  })
  @ApiResponse({ status: 200, description: 'Résultats de recherche business' })
  async search(@Query() searchDto: BusinessSearchDto) {
    return this.businessService.search(searchDto);
  }

  @Post('search')
  @ApiOperation({
    summary: "Recherche d'entités business via POST (pas d'auth requise)",
    description:
      'Endpoint public pour rechercher des entités business par dénomination via POST',
  })
  @ApiResponse({ status: 200, description: 'Résultats de recherche business' })
  async searchPost(@Body() searchDto: BusinessSearchDto) {
    return this.businessService.search(searchDto);
  }

  @Post(':id/clicks')
  @ApiOperation({
    summary:
      "Incrémenter les clics sur une entité business (pas d'auth requise)",
    description:
      "Endpoint public pour incrémenter le compteur de clics d'une entité business",
  })
  @ApiParam({
    name: 'id',
    description: "ID de l'entité business",
    type: 'number',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Type de clic (day, week, month)',
    example: 'day',
  })
  @ApiResponse({ status: 200, description: 'Clics incrémentés avec succès' })
  @HttpCode(HttpStatus.OK)
  async incrementClicks(
    @Param('id', ParseIntPipe) id: number,
    @Query('type') clickType?: 'day' | 'week' | 'month',
  ) {
    return this.businessService.incrementClicks(id, clickType);
  }

  @Get()
  @ApiOperation({
    summary: 'Liste de toutes les entités business',
    description:
      "Récupère la liste des entités business comme les studios d'animation, auteurs, éditeurs, etc.",
  })
  @ApiResponse({ status: 200, description: 'Liste des entités business' })
  async findAll(@Query() query: BusinessQueryDto) {
    return this.businessService.findAll(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Créer une nouvelle entité business (Admin seulement)',
    description:
      "Créer une nouvelle entité business comme un studio d'animation, auteur, éditeur, etc.",
  })
  @ApiResponse({
    status: 201,
    description: 'Entité business créée avec succès',
  })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 403, description: 'Accès admin requis' })
  async create(@Body() createBusinessDto: CreateBusinessDto) {
    return this.businessService.create(createBusinessDto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Récupérer une entité business spécifique par ID',
    description: "Récupère les détails d'une entité business spécifique",
  })
  @ApiParam({
    name: 'id',
    description: "ID de l'entité business",
    type: 'number',
  })
  @ApiResponse({ status: 200, description: "Détails de l'entité business" })
  @ApiResponse({ status: 404, description: 'Entité business introuvable' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.businessService.findOne(id);
  }

  @Get(':id/animes')
  @ApiOperation({
    summary: 'Récupérer les animes liés à une entité business',
    description: "Récupère tous les animes associés à une entité business (studio, auteur, etc.)",
  })
  @ApiParam({
    name: 'id',
    description: "ID de l'entité business",
    type: 'number',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (starts at 1)',
    type: 'number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page',
    type: 'number',
  })
  @ApiResponse({ status: 200, description: "Liste des animes liés" })
  @ApiResponse({ status: 404, description: 'Entité business introuvable' })
  async getRelatedAnimes(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.businessService.getRelatedAnimes(id, page, limit);
  }

  @Get(':id/mangas')
  @ApiOperation({
    summary: 'Récupérer les mangas liés à une entité business',
    description: "Récupère tous les mangas associés à une entité business (studio, auteur, etc.)",
  })
  @ApiParam({
    name: 'id',
    description: "ID de l'entité business",
    type: 'number',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (starts at 1)',
    type: 'number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page',
    type: 'number',
  })
  @ApiResponse({ status: 200, description: "Liste des mangas liés" })
  @ApiResponse({ status: 404, description: 'Entité business introuvable' })
  async getRelatedMangas(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.businessService.getRelatedMangas(id, page, limit);
  }

  @Get(':id/jeux-video')
  @ApiOperation({
    summary: 'Récupérer les jeux vidéo liés à une entité business',
    description: "Récupère tous les jeux vidéo associés à une entité business (développeur, éditeur, etc.)",
  })
  @ApiParam({
    name: 'id',
    description: "ID de l'entité business",
    type: 'number',
  })
  @ApiResponse({ status: 200, description: "Liste des jeux vidéo liés" })
  @ApiResponse({ status: 404, description: 'Entité business introuvable' })
  async getRelatedGames(@Param('id', ParseIntPipe) id: number) {
    return this.businessService.getRelatedGames(id);
  }

  @Get(':id/businesses')
  @ApiOperation({
    summary: 'Récupérer les entités business liées à une entité business',
    description: "Récupère toutes les entités business associées (filiales, partenaires, maison mère, etc.)",
  })
  @ApiParam({
    name: 'id',
    description: "ID de l'entité business",
    type: 'number',
  })
  @ApiResponse({ status: 200, description: "Liste des entités business liées" })
  @ApiResponse({ status: 404, description: 'Entité business introuvable' })
  async getRelatedBusinesses(@Param('id', ParseIntPipe) id: number) {
    return this.businessService.getRelatedBusinesses(id);
  }

  @Get(':id/articles')
  @ApiOperation({
    summary: 'Articles webzine liés à une entité business',
    description: "Récupère tous les articles du webzine liés à une entité business",
  })
  @ApiParam({
    name: 'id',
    description: "ID de l'entité business",
    type: 'number',
  })
  @ApiResponse({ status: 200, description: 'Liste des articles' })
  @ApiResponse({ status: 404, description: 'Entité business introuvable' })
  async getBusinessArticles(@Param('id', ParseIntPipe) id: number) {
    try {
      return await this.businessService.getBusinessArticles(id);
    } catch (error) {
      console.error('Controller error in getBusinessArticles:', error);
      throw error;
    }
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mettre à jour une entité business (Admin seulement)',
    description: "Met à jour les informations d'une entité business",
  })
  @ApiParam({
    name: 'id',
    description: "ID de l'entité business",
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Entité business mise à jour avec succès',
  })
  @ApiResponse({ status: 404, description: 'Entité business introuvable' })
  @ApiResponse({ status: 403, description: 'Accès admin requis' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateBusinessDto: UpdateBusinessDto,
  ) {
    return this.businessService.update(id, updateBusinessDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprimer une entité business (Admin seulement)',
    description: 'Supprime définitivement une entité business',
  })
  @ApiParam({
    name: 'id',
    description: "ID de l'entité business",
    type: 'number',
  })
  @ApiResponse({
    status: 204,
    description: 'Entité business supprimée avec succès',
  })
  @ApiResponse({ status: 404, description: 'Entité business introuvable' })
  @ApiResponse({ status: 403, description: 'Accès admin requis' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.businessService.remove(id);
  }

  @Post(':id/upload-image')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload business image to ImageKit (Admin only)' })
  @ApiResponse({ status: 200, description: 'Image uploaded and business updated' })
  async uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const folder = '/images/business';
    const result = await this.imageKitService.uploadImage(
      file.buffer,
      file.originalname,
      folder,
    );

    const updated = await this.businessService.update(id, { image: result.url });

    return { message: 'Image uploaded', url: result.url, business: updated };
  }

  @Post('upload-image-from-url')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload business image from URL to ImageKit (Admin only)' })
  @ApiResponse({ status: 200, description: 'Image uploaded from URL' })
  @ApiResponse({ status: 400, description: 'Invalid URL or upload failed' })
  async uploadImageFromUrl(
    @Body('imageUrl') imageUrl: string,
  ) {
    if (!imageUrl || !imageUrl.trim()) {
      throw new BadRequestException('Image URL is required');
    }

    return this.businessService.uploadImageFromUrl(imageUrl);
  }

  @Get('anilist/staff/search')
  @ApiOperation({
    summary: 'Search staff on AniList by name',
    description: 'Search for staff members on AniList by name for import'
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Staff name to search',
    example: 'Hayao Miyazaki'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of results',
    example: 10
  })
  @ApiResponse({ status: 200, description: 'Staff search results from AniList' })
  async searchAniListStaff(
    @Query('q') query: string,
    @Query('limit') limit?: number
  ) {
    return this.aniListService.searchStaff(query, limit);
  }

  @Get('anilist/studios/search')
  @ApiOperation({
    summary: 'Search studios on AniList by name',
    description: 'Search for studios on AniList by name for import'
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Studio name to search',
    example: 'Studio Ghibli'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of results',
    example: 10
  })
  @ApiResponse({ status: 200, description: 'Studio search results from AniList' })
  async searchAniListStudios(
    @Query('q') query: string,
    @Query('limit') limit?: number
  ) {
    return this.aniListService.searchStudios(query, limit);
  }

  @Post('import/anilist/staff/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Import staff from AniList by ID (Admin only)',
    description: 'Import a staff member from AniList and create as business entity'
  })
  @ApiParam({
    name: 'id',
    description: 'AniList staff ID',
    type: 'number'
  })
  @ApiResponse({ status: 201, description: 'Staff imported successfully' })
  @ApiResponse({ status: 404, description: 'Staff not found on AniList' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async importStaffFromAniList(@Param('id', ParseIntPipe) anilistId: number) {
    const staffResults = await this.aniListService.searchStaff(`id:${anilistId}`, 1);

    if (!staffResults || staffResults.length === 0) {
      throw new BadRequestException('Staff not found on AniList');
    }

    const staff = staffResults[0];
    const businessDto = this.aniListService.mapStaffToCreateBusinessDto(staff);

    return this.businessService.create(businessDto);
  }

  @Post('import/anilist/studio/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Import studio from AniList by ID (Admin only)',
    description: 'Import a studio from AniList and create as business entity'
  })
  @ApiParam({
    name: 'id',
    description: 'AniList studio ID',
    type: 'number'
  })
  @ApiResponse({ status: 201, description: 'Studio imported successfully' })
  @ApiResponse({ status: 404, description: 'Studio not found on AniList' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async importStudioFromAniList(@Param('id', ParseIntPipe) anilistId: number) {
    const studioResults = await this.aniListService.searchStudios(`id:${anilistId}`, 1);

    if (!studioResults || studioResults.length === 0) {
      throw new BadRequestException('Studio not found on AniList');
    }

    const studio = studioResults[0];
    const businessDto = this.aniListService.mapStudioToCreateBusinessDto(studio);

    return this.businessService.create(businessDto);
  }
}

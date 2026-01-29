import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AdminMangasService } from './admin-mangas.service';
import { AdminMangaListQueryDto, CreateAdminMangaDto, UpdateAdminMangaDto } from './dto/admin-manga.dto';
import { GoogleBooksService } from '../../mangas/google-books.service';
import { MangaVolumesService } from '../../mangas/manga-volumes.service';
import { NautiljonService } from '../../mangas/nautiljon.service';

@ApiTags('Admin - Mangas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/mangas')
export class AdminMangasController {
  constructor(
    private readonly service: AdminMangasService,
    private readonly googleBooksService: GoogleBooksService,
    private readonly mangaVolumesService: MangaVolumesService,
    private readonly nautiljonService: NautiljonService,
  ) { }

  @Get()
  @ApiOperation({ summary: 'Liste des mangas (admin)' })
  list(@Query() query: AdminMangaListQueryDto) { return this.service.list(query); }

  @Get('no-screenshots')
  @ApiOperation({ summary: 'Liste des mangas sans screenshots (admin)' })
  @ApiResponse({ status: 200, description: 'Liste des mangas sans screenshots' })
  getMangasWithoutScreenshots(
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
  ) {
    return this.service.getMangasWithoutScreenshots(search, sortBy);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un manga (admin)' })
  getOne(@Param('id', ParseIntPipe) id: number) { return this.service.getOne(id); }

  @Post()
  @ApiOperation({ summary: 'Créer un manga (admin)' })
  create(@Request() req, @Body() dto: CreateAdminMangaDto) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.create(dto, username);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un manga (admin)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAdminMangaDto, @CurrentUser() user: any) { return this.service.update(id, dto, user); }

  @Put(':id/status')
  @ApiOperation({ summary: 'Mettre à jour le statut (admin)' })
  updateStatus(@Request() req, @Param('id', ParseIntPipe) id: number, @Body('statut', ParseIntPipe) statut: number) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.updateStatus(id, statut, username);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un manga (admin)' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }

  @Post(':id/volumes/sync')
  @ApiOperation({ summary: 'Générer/Sync les volumes depuis le nombre de volumes' })
  @ApiResponse({ status: 200, description: 'Volumes générés' })
  syncVolumes(@Param('id', ParseIntPipe) id: number) {
    return this.service.generateVolumesFromCount(id);
  }

  @Post('import-image')
  @ApiOperation({
    summary: 'Import manga image to ImageKit',
    description: 'Download and upload a manga image from AniList/external sources to ImageKit'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string', description: 'URL of the image to import' },
        mangaTitle: { type: 'string', description: 'Title of the manga for filename generation' }
      },
      required: ['imageUrl', 'mangaTitle']
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Image import result'
  })
  async importImage(
    @Body() importData: { imageUrl: string; mangaTitle: string },
  ): Promise<any> {
    return this.service.importMangaImage(importData.imageUrl, importData.mangaTitle);
  }

  @Get('volume-info/:isbn')
  @ApiOperation({
    summary: 'Get volume info by ISBN',
    description: 'Fetch volume details (title, cover, release date, description) from Google Books API using ISBN'
  })
  @ApiParam({ name: 'isbn', description: 'ISBN-10 or ISBN-13 (with or without dashes)' })
  @ApiResponse({
    status: 200,
    description: 'Volume info from Google Books',
    schema: {
      type: 'object',
      properties: {
        found: { type: 'boolean' },
        title: { type: 'string' },
        subtitle: { type: 'string' },
        authors: { type: 'array', items: { type: 'string' } },
        publisher: { type: 'string' },
        publishedDate: { type: 'string' },
        description: { type: 'string' },
        isbn13: { type: 'string' },
        isbn10: { type: 'string' },
        pageCount: { type: 'number' },
        imageUrl: { type: 'string' },
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Volume not found' })
  async getVolumeInfoByIsbn(@Param('isbn') isbn: string): Promise<any> {
    // Clean ISBN (remove dashes and spaces)
    const cleanIsbn = isbn.replace(/[-\s]/g, '');

    const result = await this.googleBooksService.getByISBN(cleanIsbn);

    if (!result) {
      return {
        found: false,
        message: `No volume found for ISBN: ${isbn}`
      };
    }

    return {
      found: true,
      ...result
    };
  }

  // ========== VOLUME SYNC ENDPOINTS ==========

  @Get(':id/volumes')
  @ApiOperation({ summary: 'Get all volumes for a manga' })
  @ApiParam({ name: 'id', description: 'Manga ID' })
  @ApiResponse({ status: 200, description: 'List of volumes' })
  async getVolumes(@Param('id', ParseIntPipe) id: number) {
    return this.mangaVolumesService.getVolumes(id);
  }

  @Post(':id/volumes/sync-info')
  @ApiOperation({
    summary: 'Sync volume info from external sources',
    description: 'Fetches volume info (ISBN, release date, cover) from Google Books for French editions. Uses Jikan for title variants.'
  })
  @ApiParam({ name: 'id', description: 'Manga ID' })
  @ApiQuery({ name: 'fromVolume', required: false, description: 'Start from volume number (default: 1)' })
  @ApiQuery({ name: 'toVolume', required: false, description: 'End at volume number (default: manga.nbVolumes)' })
  @ApiQuery({ name: 'uploadCovers', required: false, description: 'Upload covers to R2 (default: true)' })
  @ApiQuery({ name: 'force', required: false, description: 'Re-sync even if volume already has data (default: false)' })
  @ApiResponse({
    status: 200,
    description: 'Sync results',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        summary: {
          type: 'object',
          properties: {
            created: { type: 'number' },
            updated: { type: 'number' },
            skipped: { type: 'number' },
            errors: { type: 'number' },
          }
        },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              volumeNumber: { type: 'number' },
              status: { type: 'string', enum: ['created', 'updated', 'skipped', 'error'] },
              message: { type: 'string' },
              coverUploaded: { type: 'boolean' },
            }
          }
        }
      }
    }
  })
  async syncVolumeInfo(
    @Param('id', ParseIntPipe) id: number,
    @Query('fromVolume') fromVolume?: string,
    @Query('toVolume') toVolume?: string,
    @Query('uploadCovers') uploadCovers?: string,
    @Query('force') force?: string,
  ) {
    return this.mangaVolumesService.syncAllVolumes(id, {
      fromVolume: fromVolume ? parseInt(fromVolume, 10) : undefined,
      toVolume: toVolume ? parseInt(toVolume, 10) : undefined,
      uploadCovers: uploadCovers !== 'false',
      force: force === 'true',
    });
  }

  @Post(':id/volumes/import')
  @ApiOperation({
    summary: 'Import a single volume with manual data',
    description: 'Create or update a volume with manually provided data. Cover URL will be uploaded to R2.'
  })
  @ApiParam({ name: 'id', description: 'Manga ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['volumeNumber'],
      properties: {
        volumeNumber: { type: 'number', description: 'Volume number', example: 1 },
        title: { type: 'string', description: 'Volume title', example: 'Tome 1 - Le commencement' },
        isbn: { type: 'string', description: 'ISBN-13', example: '9782756078519' },
        releaseDate: { type: 'string', description: 'French release date (YYYY-MM-DD)', example: '2020-01-15' },
        coverUrl: { type: 'string', description: 'Cover image URL to upload', example: 'https://example.com/cover.jpg' },
        description: { type: 'string', description: 'Volume description' },
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Import result' })
  async importVolume(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: {
      volumeNumber: number;
      title?: string;
      isbn?: string;
      releaseDate?: string;
      coverUrl?: string;
      description?: string;
    },
  ) {
    return this.mangaVolumesService.importVolume(id, data);
  }

  @Get(':id/volumes/:volumeNumber/search')
  @ApiOperation({
    summary: 'Search volume info by title and number',
    description: 'Search for volume info without saving. Useful for preview before import.'
  })
  @ApiParam({ name: 'id', description: 'Manga ID' })
  @ApiParam({ name: 'volumeNumber', description: 'Volume number to search' })
  @ApiResponse({ status: 200, description: 'Volume info from search' })
  async searchVolumeInfo(
    @Param('id', ParseIntPipe) id: number,
    @Param('volumeNumber', ParseIntPipe) volumeNumber: number,
  ) {
    // Get manga title
    const manga = await this.service.getOne(id);
    if (!manga) {
      return { found: false, message: 'Manga not found' };
    }

    // Get title variants from Jikan
    const titleVariants = await this.mangaVolumesService.getMangaTitleVariants(manga.titre);

    // Search for volume info
    const volumeInfo = await this.mangaVolumesService.searchVolumeInfo(
      manga.titre,
      volumeNumber,
      titleVariants,
    );

    return {
      found: !!volumeInfo?.isbn,
      mangaTitle: manga.titre,
      titleVariants,
      volumeInfo,
    };
  }

  @Get('volumes/missing-covers')
  @ApiOperation({
    summary: 'Get volumes without covers',
    description: 'List volumes that are missing cover images (for bulk operations)'
  })
  @ApiQuery({ name: 'mangaId', required: false, description: 'Filter by manga ID' })
  @ApiResponse({ status: 200, description: 'List of volumes without covers' })
  async getVolumesWithoutCovers(@Query('mangaId') mangaId?: string) {
    return this.mangaVolumesService.getVolumesWithoutCovers(
      mangaId ? parseInt(mangaId, 10) : undefined
    );
  }

  @Get('nautiljon/search')
  @ApiOperation({
    summary: 'Search volume on Nautiljon directly',
    description: 'Search Nautiljon for a specific manga volume. Useful for debugging or when Google Books fails.'
  })
  @ApiQuery({ name: 'title', required: true, description: 'Manga title (e.g., "Bleach", "Death Note")' })
  @ApiQuery({ name: 'volume', required: true, description: 'Volume number' })
  @ApiResponse({
    status: 200,
    description: 'Volume info from Nautiljon',
    schema: {
      type: 'object',
      properties: {
        found: { type: 'boolean' },
        volumeNumber: { type: 'number' },
        title: { type: 'string' },
        isbn: { type: 'string' },
        releaseDate: { type: 'string' },
        coverUrl: { type: 'string' },
        description: { type: 'string' },
        publisher: { type: 'string' },
        source: { type: 'string', enum: ['nautiljon'] },
        sourceUrl: { type: 'string' },
      }
    }
  })
  async searchNautiljon(
    @Query('title') title: string,
    @Query('volume') volume: string,
  ) {
    const volumeNumber = parseInt(volume, 10);
    if (isNaN(volumeNumber) || volumeNumber < 1) {
      return { found: false, message: 'Invalid volume number' };
    }

    const result = await this.nautiljonService.searchVolume(title, volumeNumber);

    if (!result) {
      return {
        found: false,
        message: `No volume found for "${title}" Tome ${volumeNumber} on Nautiljon`,
      };
    }

    return {
      found: !!(result.isbn || result.releaseDate || result.coverUrl),
      ...result,
    };
  }
}


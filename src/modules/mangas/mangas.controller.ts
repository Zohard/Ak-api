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
} from '@nestjs/swagger';
import { MangasService } from './mangas.service';
import { CreateMangaDto } from './dto/create-manga.dto';
import { UpdateMangaDto } from './dto/update-manga.dto';
import { MangaQueryDto } from './dto/manga-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('Mangas')
@Controller('mangas')
export class MangasController {
  constructor(private readonly mangasService: MangasService) {}

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
  @ApiResponse({ status: 200, description: 'Liste des meilleurs mangas' })
  async getTopMangas(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit) : 10;
    return this.mangasService.getTopMangas(parsedLimit);
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

  @Get(':id/staff')
  @ApiOperation({ summary: 'Staff et équipe technique pour un manga spécifique' })
  @ApiParam({ name: 'id', description: 'ID du manga', type: 'number' })
  @ApiResponse({ status: 200, description: 'Liste du staff' })
  @ApiResponse({ status: 404, description: 'Manga introuvable' })
  async getMangaStaff(@Param('id', ParseIntPipe) id: number) {
    return this.mangasService.getMangaStaff(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un manga par ID' })
  @ApiParam({ name: 'id', description: 'ID du manga', type: 'number' })
  @ApiResponse({ status: 200, description: 'Détails du manga' })
  @ApiResponse({ status: 404, description: 'Manga introuvable' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('includeReviews') includeReviews = false,
  ) {
    return this.mangasService.findOne(id, includeReviews);
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
}

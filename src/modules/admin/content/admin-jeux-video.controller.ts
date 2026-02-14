import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Request, UseGuards, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { AdminJeuxVideoService } from './admin-jeux-video.service';
import { AdminJeuxVideoListQueryDto, CreateAdminJeuxVideoDto, UpdateAdminJeuxVideoDto } from './dto/admin-jeux-video.dto';
import { CreateJeuVideoTrailerDto } from './dto/create-jeu-video-trailer.dto';
import { UpdateJeuVideoTrailerDto } from './dto/update-jeu-video-trailer.dto';

@ApiTags('Admin - Jeux Vidéo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/jeux-video')
export class AdminJeuxVideoController {
  constructor(private readonly service: AdminJeuxVideoService) {}

  @Get()
  @ApiOperation({ summary: 'Liste des jeux vidéo (admin)' })
  list(@Query() query: AdminJeuxVideoListQueryDto) {
    return this.service.list(query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search jeux video by name for autocomplete' })
  async searchJeuxVideo(
    @Query('q') q: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    if (!q || !q.trim()) return { items: [] };
    const lim = limit || 10;
    return this.service.searchByName(q.trim(), lim);
  }

  @Post('check-igdb-ids')
  @ApiOperation({ summary: 'Check which IGDB IDs already exist in the database' })
  async checkIgdbIds(@Body('igdbIds') igdbIds: number[]) {
    if (!igdbIds || !Array.isArray(igdbIds) || igdbIds.length === 0) {
      return { exists: {} };
    }
    return this.service.checkIgdbIds(igdbIds);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une fiche jeu vidéo (admin)' })
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.getOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une fiche jeu vidéo (admin)' })
  create(@Request() req, @Body() dto: CreateAdminJeuxVideoDto) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.create(dto, username);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour une fiche jeu vidéo (admin)' })
  update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAdminJeuxVideoDto) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.update(id, dto, username);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Mettre à jour le statut (admin)' })
  updateStatus(@Request() req, @Param('id', ParseIntPipe) id: number, @Body('statut', ParseIntPipe) statut: number) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.updateStatus(id, statut, username);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une fiche jeu vidéo (admin)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Get('igdb/search')
  @ApiOperation({ summary: 'Rechercher des jeux sur IGDB' })
  searchIgdb(@Query('query') query: string) {
    return this.service.searchIgdb(query);
  }

  @Post('igdb/import/:igdbId')
  @ApiOperation({ summary: 'Importer un jeu depuis IGDB' })
  importFromIgdb(@Request() req, @Param('igdbId', ParseIntPipe) igdbId: number) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.importFromIgdb(igdbId, username);
  }

  @Get('igdb/fetch/:igdbId')
  @ApiOperation({ summary: 'Récupérer les données IGDB sans créer d\'entrée (pour mise à jour de formulaire)' })
  fetchFromIgdb(
    @Param('igdbId', ParseIntPipe) igdbId: number,
    @Query('currentImage') currentImage?: string,
  ) {
    return this.service.fetchFromIgdb(igdbId, currentImage || null);
  }

  @Post(':id/igdb/screenshots/:igdbId')
  @ApiOperation({ summary: 'Récupérer et sauvegarder les screenshots depuis IGDB pour un jeu existant' })
  fetchAndSaveScreenshots(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Param('igdbId', ParseIntPipe) igdbId: number
  ) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.fetchAndSaveScreenshots(id, igdbId, username);
  }

  @Post(':id/igdb/trailers/:igdbId')
  @ApiOperation({ summary: 'Récupérer et sauvegarder les trailers depuis IGDB pour un jeu existant' })
  fetchAndSaveTrailers(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Param('igdbId', ParseIntPipe) igdbId: number
  ) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.fetchAndSaveTrailers(id, igdbId, username);
  }

  @Post('trailers')
  @ApiOperation({ summary: 'Ajouter une bande-annonce' })
  addTrailer(@Request() req, @Body() dto: CreateJeuVideoTrailerDto) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.addTrailer(dto, username);
  }

  @Patch('trailers/:trailerId')
  @ApiOperation({ summary: 'Modifier une bande-annonce' })
  updateTrailer(
    @Request() req,
    @Param('trailerId', ParseIntPipe) trailerId: number,
    @Body() dto: UpdateJeuVideoTrailerDto
  ) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.updateTrailer(trailerId, dto, username);
  }

  @Delete('trailers/:trailerId')
  @ApiOperation({ summary: 'Supprimer une bande-annonce' })
  removeTrailer(
    @Request() req,
    @Param('trailerId', ParseIntPipe) trailerId: number
  ) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.removeTrailer(trailerId, username);
  }

  @Post(':id/business')
  @ApiOperation({ summary: 'Ajouter une relation business (staff/studio/etc.)' })
  addBusinessRelation(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { idBusiness: number; type: string }
  ) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.addBusinessRelation(id, body.idBusiness, body.type, username);
  }

  @Delete(':id/business/:relationId')
  @ApiOperation({ summary: 'Supprimer une relation business' })
  removeBusinessRelation(
    @Request() req,
    @Param('relationId', ParseIntPipe) relationId: number
  ) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.removeBusinessRelation(relationId, username);
  }

  @Post(':id/igdb/staff/:igdbId')
  @ApiOperation({ summary: 'Importer le staff depuis IGDB pour un jeu existant' })
  importStaffFromIgdb(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Param('igdbId', ParseIntPipe) igdbId: number
  ) {
    const username = req.user?.pseudo || req.user?.member_name || 'admin';
    return this.service.importStaffFromIgdb(id, igdbId, username);
  }

  @Post(':id/translate-description')
  @ApiOperation({ summary: 'Traduire la description en français via DeepL' })
  translateDescription(
    @Param('id', ParseIntPipe) id: number,
    @Body('text') text: string
  ) {
    return this.service.translateDescription(text);
  }
}
